"""Regresión Fase 2: JWT real firmado, RBAC, vínculo explícito y auditoría.

Usa SQLite + claves RSA efímeras. No conecta con Supabase ni requiere secretos.
"""
from datetime import datetime, timedelta, timezone
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
from app.db.tables import audit_logs, metadata, users
from app.main import app


@pytest.fixture
def fixture_db(monkeypatch):
    engine = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @event.listens_for(engine, 'connect')
    def setup(db, _):
        db.execute("ATTACH DATABASE ':memory:' AS public")
        db.create_function('gen_random_uuid', 0, lambda: uuid4().hex)
    metadata.create_all(engine, tables=[users, audit_logs])
    app.dependency_overrides[get_read_engine] = lambda: engine
    monkeypatch.setattr(settings, 'supabase_url', 'https://test-project.supabase.co')
    monkeypatch.setattr(settings, 'supabase_publishable_key', 'sb_publishable_test')
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(security, '_jwks', lambda: SimpleNamespace(
        get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key())))
    yield engine, key
    app.dependency_overrides.clear()
    engine.dispose()


def make_token(key, auth_id, **overrides):
    claims = {'sub': str(auth_id), 'iss': 'https://test-project.supabase.co/auth/v1',
              'aud': 'authenticated', 'exp': datetime.now(timezone.utc)+timedelta(hours=1),
              'role': 'authenticated'}
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm='RS256', headers={'kid': 'dev-key'})


def headers(key, uid):
    return {'Authorization': f'Bearer {make_token(key, uid)}'}


def test_missing_token_and_unlinked_user_denied(fixture_db):
    engine, key = fixture_db
    client = TestClient(app)
    assert client.get('/api/v1/auth/me').status_code == 401
    assert client.get('/api/v1/auth/me', headers=headers(key, uuid4())).status_code == 403
    assert client.get('/api/v1/admin/audit', headers=headers(key, uuid4())).status_code == 403


def test_admin_operator_readonly_permissions_and_audit(fixture_db):
    engine, key = fixture_db
    admin_uid, viewer_uid, auditor_uid = uuid4(), uuid4(), uuid4()
    admin_id = link_user(engine, auth_id=admin_uid, email='admin@example.org', name='Admin', role='administrador')
    viewer_id = link_user(engine, auth_id=viewer_uid, email='viewer@example.org', name='Lectura', role='solo_lectura')
    link_user(engine, auth_id=auditor_uid, email='auditor@example.org', name='Auditor', role='auditor')
    client = TestClient(app)
    assert client.get('/api/v1/auth/me', headers=headers(key, admin_uid)).json()['role'] == 'administrador'
    assert client.post('/api/v1/auth/session', headers=headers(key, admin_uid)).status_code == 200
    assert client.get('/api/v1/admin/users', headers=headers(key, viewer_uid)).status_code == 403
    assert client.get('/api/v1/admin/audit', headers=headers(key, auditor_uid)).status_code == 200
    assert client.patch(f'/api/v1/admin/users/{viewer_id}', json={'role':'administrador'},
                        headers=headers(key, viewer_uid)).status_code == 403
    assert client.patch(f'/api/v1/admin/users/{admin_id}', json={'status':'suspended'},
                        headers=headers(key, admin_uid)).status_code == 409
    response = client.patch(f'/api/v1/admin/users/{viewer_id}', json={'status':'suspended'},
                            headers=headers(key, admin_uid))
    assert response.status_code == 200
    assert client.get('/api/v1/auth/me', headers=headers(key, viewer_uid)).status_code == 403
    with engine.connect() as conn:
        actions = conn.execute(select(audit_logs.c.action)).scalars().all()
    assert 'identity.user.updated' in actions
    assert 'identity.session.started' in actions


def test_fake_jwt_and_expiry_rejected(fixture_db):
    engine, key = fixture_db
    uid = uuid4()
    link_user(engine, auth_id=uid, email='test@example.org', name='Test')
    client = TestClient(app)
    assert client.get('/api/v1/auth/me', headers={'Authorization':'Bearer fake.token.value'}).status_code == 401
    expired = make_token(key, uid, exp=datetime.now(timezone.utc)-timedelta(hours=1))
    assert client.get('/api/v1/auth/me', headers={'Authorization':f'Bearer {expired}'}).status_code == 401
    wrong_audience = make_token(key, uid, aud='service_role')
    assert client.get('/api/v1/auth/me', headers={'Authorization':f'Bearer {wrong_audience}'}).status_code == 401


def test_email_cannot_impersonate_auth_identity(fixture_db):
    engine, key = fixture_db
    first_uid, outsider = uuid4(), uuid4()
    link_user(engine, auth_id=first_uid, email='same@example.org', name='Uno', role='administrador')
    with pytest.raises(ValueError):
        link_user(engine, auth_id=outsider, email='same@example.org', name='Falso', role='administrador')
    assert TestClient(app).get('/api/v1/auth/me', headers=headers(key, outsider)).status_code == 403


def test_legacy_hs256_must_be_verified_by_auth_server(fixture_db, monkeypatch):
    """La firma compartida no se acepta localmente; solo tras respuesta de Auth."""
    engine, _ = fixture_db
    uid = uuid4()
    link_user(engine, auth_id=uid, email='legacy@example.org', name='Legacy')
    token = jwt.encode({'sub': str(uid)}, 'test-secret-is-at-least-32-bytes-long-for-hmac', algorithm='HS256')
    class Rejection:
        status_code = 401
    monkeypatch.setattr(security.httpx, 'get', lambda *a, **k: Rejection())
    client = TestClient(app)
    assert client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {token}'}).status_code == 401

    class Accepted:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {'id': str(uid)}
    monkeypatch.setattr(security.httpx, 'get', lambda *a, **k: Accepted())
    response = client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 200
    assert response.json()['auth_user_id'] == str(uid)
