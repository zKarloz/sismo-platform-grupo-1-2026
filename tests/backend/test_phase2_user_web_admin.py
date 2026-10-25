"""Pruebas aisladas: alta segura, RBAC, compensación y paginación de usuarios."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.pool import StaticPool

from app.auth import provisioning, security
from app.commands.link_identity import link_user
from app.core.config import settings
from app.db.session import get_read_engine
from app.db.tables import audit_logs, metadata, users
from app.main import app


@pytest.fixture
def context(monkeypatch):
    engine = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @event.listens_for(engine, 'connect')
    def setup(db, _):
        db.execute("ATTACH DATABASE ':memory:' AS public")
        db.create_function('gen_random_uuid', 0, lambda: uuid4().hex)
    metadata.create_all(engine, tables=[users, audit_logs])
    app.dependency_overrides[get_read_engine] = lambda: engine
    monkeypatch.setattr(settings, 'supabase_url', 'https://example.supabase.co')
    monkeypatch.setattr(settings, 'supabase_publishable_key', 'sb_publishable_test')
    monkeypatch.setattr(settings, 'supabase_secret_key', 'sb_secret_test_backend_only')
    monkeypatch.setattr(settings, 'allow_demo_user_creation', False)
    monkeypatch.setattr(settings, 'environment', 'development')
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(security, '_jwks', lambda: SimpleNamespace(
        get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key())))
    admin_auth, auditor_auth = uuid4(), uuid4()
    link_user(engine, auth_id=admin_auth, name='Admin', email='admin@test.org', role='administrador')
    link_user(engine, auth_id=auditor_auth, name='Auditor', email='auditor@test.org', role='auditor')
    def auth(uid):
        token = jwt.encode({
            'sub': str(uid), 'iss': 'https://example.supabase.co/auth/v1',
            'aud': 'authenticated', 'exp': datetime.now(timezone.utc)+timedelta(hours=1),
            'role': 'authenticated',
        }, key, algorithm='RS256', headers={'kid': 'dev'})
        return {'Authorization': f'Bearer {token}'}
    yield engine, TestClient(app), auth(admin_auth), auth(auditor_auth), monkeypatch
    app.dependency_overrides.clear()
    engine.dispose()


def test_invite_admin_links_audit_no_password(context):
    engine, client, admin, auditor, monkeypatch = context
    called = []
    def provider(**kw):
        called.append(kw)
        assert kw == {'email': 'rosa@example.org', 'name': 'Rosa Quispe', 'mode': 'invite', 'password': None}
        return uuid4()
    monkeypatch.setattr('app.routes.identity.create_auth_identity', provider)
    result = client.post('/api/v1/admin/users', headers=admin, json={
        'full_name': 'Rosa Quispe', 'email': 'Rosa@Example.org', 'role': 'analista', 'mode': 'invite',
    })
    assert result.status_code == 201, result.text
    assert result.json()['role'] == 'analista'
    assert len(called) == 1
    with engine.connect() as conn:
        account = conn.execute(select(users).where(users.c.email == 'rosa@example.org')).mappings().one()
        audit = conn.execute(select(audit_logs).where(audit_logs.c.action == 'identity.user.invited')).mappings().one()
    assert account['auth_user_id'] is not None
    assert audit['after_json']['role'] == 'analista'
    assert 'password' not in str(audit)
    assert client.post('/api/v1/admin/users', headers=admin, json={
        'full_name': 'Duplicado', 'email': 'ROSA@example.org', 'role': 'analista'}).status_code == 409
    assert len(called) == 1


def test_rbac_admin_only_and_demo_requires_opt_in(context):
    _, client, admin, auditor, monkeypatch = context
    body = {'full_name': 'Juan Estudiante', 'email': 'juan@proyecto.test', 'role': 'solo_lectura',
            'mode': 'demo', 'password': 'password-fuerte-12345'}
    unauthed = client.post('/api/v1/admin/users', json=body)
    assert unauthed.status_code == 401
    # Los errores de la API no deben reflejar el valor de la contraseña.
    assert body['password'] not in unauthed.text
    assert client.post('/api/v1/admin/users', json=body, headers=auditor).status_code == 403
    invalid = client.post('/api/v1/admin/users', json=body, headers=admin)
    assert invalid.status_code == 422
    assert body['password'] not in invalid.text
    monkeypatch.setattr(settings, 'allow_demo_user_creation', True)
    assert client.post('/api/v1/admin/users', headers=admin,
                       json={**body, 'email': 'real@gmail.com'}).status_code == 422
    assert client.post('/api/v1/admin/users', headers=admin,
                       json={**body, 'password': 'too-short'}).status_code == 422
    monkeypatch.setattr(settings, 'environment', 'production')
    assert client.post('/api/v1/admin/users', headers=admin, json=body).status_code == 422


def test_demo_password_not_audited_and_filters_and_pages(context):
    engine, client, admin, auditor, monkeypatch = context
    monkeypatch.setattr(settings, 'allow_demo_user_creation', True)
    captured = []
    def provider(**kw):
        captured.append(kw)
        return uuid4()
    monkeypatch.setattr('app.routes.identity.create_auth_identity', provider)
    secret = 'TestExamplePassword!234'
    response = client.post('/api/v1/admin/users', headers=admin, json={
        'full_name': 'Zeta Estudiante', 'email': 'zeta@proyecto.test',
        'role': 'solo_lectura', 'mode': 'demo', 'password': secret,
    })
    assert response.status_code == 201, response.text
    assert captured[0]['password'] == secret
    with engine.connect() as conn:
        actions = conn.execute(select(audit_logs.c.after_json)).all()
    assert secret not in str(actions)
    # Auditor puede listar y paginar, nunca crear.
    page = client.get('/api/v1/admin/users?page=1&page_size=5&q=zeta&role=solo_lectura', headers=auditor)
    assert page.status_code == 200, page.text
    assert page.json()['total'] == 1
    assert page.json()['items'][0]['email'] == 'zeta@proyecto.test'
    assert page.json()['demo_enabled'] is True
    next_page = client.get('/api/v1/admin/users?page=2&page_size=5', headers=auditor)
    assert next_page.status_code == 200
    assert next_page.json()['items'] == []
    assert client.get('/api/v1/admin/users?page_size=1000', headers=admin).status_code == 422
    assert client.get('/api/v1/admin/users?role=owner', headers=admin).status_code == 422


def test_cleanup_after_db_error_and_http_error_redaction(context):
    engine, client, admin, _, monkeypatch = context
    # Reutilizar UUID ya vinculado fuerza una violación del unique auth_user_id.
    linked_uid = uuid4()
    link_user(engine, auth_id=linked_uid, name='Preexistente', email='exists@project.test')
    cleaned = []
    monkeypatch.setattr('app.routes.identity.create_auth_identity', lambda **_: linked_uid)
    monkeypatch.setattr('app.routes.identity.delete_created_identity', lambda uid: cleaned.append(uid) or True)
    result = client.post('/api/v1/admin/users', headers=admin, json={
        'full_name': 'Otra cuenta', 'email': 'otra@example.org', 'role': 'solo_lectura',
    })
    assert result.status_code == 409
    assert cleaned == [linked_uid]
    # La API jamás debe trasladar el contenido (potencialmente sensible) del proveedor.
    def reject(**_):
        raise provisioning.ProvisioningError(502, 'Supabase Auth no pudo completar el alta')
    monkeypatch.setattr('app.routes.identity.create_auth_identity', reject)
    failed = client.post('/api/v1/admin/users', headers=admin, json={
        'full_name': 'Test User', 'email': 'another@example.org', 'role': 'solo_lectura',
    })
    assert failed.status_code == 502
    assert 'sb_secret' not in failed.text


def test_missing_secret_disables_admin_create(context, monkeypatch):
    _, client, admin, _, _ = context
    monkeypatch.setattr(settings, 'supabase_secret_key', '')
    result = client.post('/api/v1/admin/users', headers=admin, json={
        'full_name': 'Test User', 'email': 'test@other.org', 'role': 'solo_lectura',
    })
    assert result.status_code == 503


def test_provider_headers_no_secret_in_http_exception(monkeypatch):
    monkeypatch.setattr(settings, 'supabase_url', 'https://example.supabase.co')
    monkeypatch.setattr(settings, 'supabase_secret_key', 'sb_secret_nonbrowser')
    class FakeResponse:
        status_code = 400
    seen = []
    def fake_post(url, **kw):
        seen.append((url, kw))
        return FakeResponse()
    monkeypatch.setattr(provisioning.httpx, 'post', fake_post)
    with pytest.raises(provisioning.ProvisioningError) as caught:
        provisioning.create_auth_identity(email='a@b.test', name='Alice', mode='invite')
    assert caught.value.status_code == 409
    assert 'sb_secret' not in str(caught.value)
    assert seen[0][1]['headers']['apikey'] == 'sb_secret_nonbrowser'
    assert seen[0][0].endswith('/auth/v1/invite')
