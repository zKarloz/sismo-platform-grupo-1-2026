"""Regresión seguridad: reglas por web, RBAC y prueba efímera de Gmail.

No se consulta Gmail ni Supabase. SQLite in-memory y SMTP simulado.
"""
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.pool import StaticPool

from app.auth import security
from app.commands.link_identity import link_user
from app.core.config import settings
from app.db.session import get_read_engine
from app.db.tables import metadata, sources, users, alert_rules, audit_logs
from app.main import app
from app.routes import alert_admin
from app.alerts.gmail_test import send_gmail_test


@pytest.fixture
def ready(monkeypatch):
    db = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @event.listens_for(db, 'connect')
    def prepare(conn, _):
        conn.execute("ATTACH DATABASE ':memory:' AS public")
        conn.create_function('gen_random_uuid', 0, lambda: uuid4().hex)
    metadata.create_all(db, tables=[users, sources, alert_rules, audit_logs])
    with db.begin() as conn:
        conn.execute(sources.insert().values(id=uuid4(), name='IGP/CENSIS', organization='IGP',
                     source_type='api', status='active', base_url='https://igp.gob.pe'))
    admin_auth, viewer_auth = uuid4(), uuid4()
    admin_id = link_user(db, auth_id=admin_auth, email='admin@example.com', name='Admin', role='administrador')
    link_user(db, auth_id=viewer_auth, email='lector@example.com', name='Lector', role='solo_lectura')
    app.dependency_overrides[get_read_engine] = lambda: db
    monkeypatch.setattr(settings, 'supabase_url', 'https://test-project.supabase.co')
    monkeypatch.setattr(settings, 'supabase_publishable_key', 'sb_publishable_test')
    private = rsa.generate_private_key(public_exponent=65537,key_size=2048)
    monkeypatch.setattr(security,'_jwks',lambda: SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=private.public_key())))
    def auth(uid):
        claims = {'sub':str(uid),'iss':'https://test-project.supabase.co/auth/v1','aud':'authenticated',
                  'exp':int(datetime.now(timezone.utc).timestamp())+3600,'role':'authenticated'}
        return {'Authorization':f'Bearer {jwt.encode(claims, private, algorithm="RS256", headers={"kid":"key"})}'}
    yield db, TestClient(app), auth(admin_auth), auth(viewer_auth), admin_id
    app.dependency_overrides.clear()
    db.dispose()


def new_rule(name='IGP M3.5 email'):
    return {'name':name, 'min_magnitude':3.5,'source':'IGP/CENSIS',
            'channel':'email','destination':'destino@gmail.com','severity':'review',
            'requires_approval':True}


def test_admin_creates_email_rule_disabled_and_audited(ready):
    db, client, admin, viewer, _ = ready
    assert client.post('/api/v1/admin/alert-rules',json=new_rule()).status_code == 401
    assert client.post('/api/v1/admin/alert-rules',headers=viewer,json=new_rule()).status_code == 403
    response = client.post('/api/v1/admin/alert-rules',headers=admin,json=new_rule())
    assert response.status_code == 201, response.text
    assert response.json()['enabled'] is False
    with db.connect() as conn:
        rule = conn.execute(select(alert_rules)).mappings().one()
        logs = conn.execute(select(audit_logs.c.action)).scalars().all()
    assert rule['destination_ref'] == 'destino@gmail.com'
    assert rule['enabled'] is False and rule['requires_approval'] is True
    assert rule['min_magnitude'] == 3.5
    assert 'alert.rule.created' in logs


def test_email_cannot_bypass_approval_and_bad_recipient_rejected(ready):
    db, client, admin, *_ = ready
    data = new_rule()
    data['requires_approval'] = False
    assert client.post('/api/v1/admin/alert-rules',headers=admin,json=data).status_code == 422
    data['requires_approval']=True
    data['destination']='invalid'
    assert client.post('/api/v1/admin/alert-rules',headers=admin,json=data).status_code == 422
    with db.connect() as conn:
        assert conn.execute(select(alert_rules)).all() == []


def test_smtp_status_never_exposes_secret(ready, monkeypatch):
    _, client, admin, viewer, _ = ready
    monkeypatch.setenv('ALERT_SMTP_PASSWORD', 'dont-leak-secret')
    for field in ['ALERT_SMTP_HOST','ALERT_SMTP_FROM','ALERT_SMTP_USER']:
        monkeypatch.setenv(field, 'test-value')
    assert client.get('/api/v1/admin/smtp/status',headers=viewer).status_code == 403
    result = client.get('/api/v1/admin/smtp/status',headers=admin)
    assert result.status_code == 200
    assert result.json()['configured'] is True
    assert 'dont-leak-secret' not in result.text


def test_smtp_test_only_to_admin_with_rate_limit_and_no_secret_stored(ready, monkeypatch):
    db, client, admin, viewer, actor_id = ready
    captures=[]
    monkeypatch.setattr(alert_admin,'send_gmail_test',lambda **kwargs: captures.append(kwargs))
    payload={'gmail':'admin@gmail.com','app_password':'abcdefghijklmnop'}
    assert client.post('/api/v1/admin/smtp/gmail-test',headers=viewer,json=payload).status_code==403
    for _ in range(3):
        response = client.post('/api/v1/admin/smtp/gmail-test',headers=admin,json=payload)
        assert response.status_code==200,response.text
        assert response.json()['type']=='technical_test'
    assert client.post('/api/v1/admin/smtp/gmail-test',headers=admin,json=payload).status_code==429
    assert len(captures)==3 and {x['destination'] for x in captures} == {'admin@example.com'}
    with db.connect() as conn:
        logs=conn.execute(select(audit_logs)).mappings().all()
    smtp_logs=[x for x in logs if x['action'].startswith('alert.smtp.')]
    assert len(smtp_logs)==6
    assert all(x['actor_id']==actor_id for x in smtp_logs)
    assert 'abcdefghijklmnop' not in str(logs)
    assert 'admin@gmail.com' not in str(logs)


def test_smtp_transport_failure_sanitized_and_logged(ready, monkeypatch):
    db,client,admin,*_=ready
    import smtplib
    def fail(**kwargs):
        raise smtplib.SMTPAuthenticationError(535,b'secret must not leak')
    monkeypatch.setattr(alert_admin,'send_gmail_test',fail)
    response=client.post('/api/v1/admin/smtp/gmail-test',headers=admin,
                         json={'gmail':'admin@gmail.com','app_password':'abcdefghijklmnop'})
    assert response.status_code==502
    assert 'secret must not leak' not in response.text
    with db.connect() as conn:
        actions=conn.execute(select(audit_logs.c.action)).scalars().all()
    assert [x for x in actions if x.startswith('alert.smtp.')] == ['alert.smtp.test.requested']


def test_gmail_input_validation_rejects_header_injection_without_network():
    for gmail, password in [('bad\nBcc: victim@gmail.com','abcdefghijklmnop'),
                            ('admin@gmail.com','short')]:
        with pytest.raises(ValueError):
            send_gmail_test(gmail=gmail,app_password=password,destination='admin@example.com')
