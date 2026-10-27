"""Regresiones de Fase 2: atribución humana de la auditoría y permisos.

Pruebas aisladas, sin conexiones a Supabase ni credenciales reales.
"""
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from app.auth import security
from app.db.session import get_read_engine
from app.db.tables import audit_logs, metadata, users
from app.routes.identity import router


@pytest.fixture
def audit_setup(monkeypatch):
    """Crea solo las dos tablas necesarias en SQLite, bajo esquema public."""
    engine = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)

    @event.listens_for(engine, 'connect')
    def setup(dbapi, _):
        dbapi.execute("ATTACH DATABASE ':memory:' AS public")
        dbapi.create_function('gen_random_uuid', 0, lambda: str(uuid4()))

    metadata.create_all(engine, tables=[users, audit_logs])
    admin_id, target_id = uuid4(), uuid4()
    admin_auth_id, viewer_auth_id = uuid4(), uuid4()
    viewer_id = uuid4()
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        conn.execute(users.insert(), [
            {'id': admin_id, 'auth_user_id': admin_auth_id, 'email': 'admin@test.example',
             'full_name': 'Ana Torres', 'role': 'administrador', 'status': 'active'},
            {'id': target_id, 'auth_user_id': uuid4(), 'email': 'analista@test.example',
             'full_name': 'Luis Gómez', 'role': 'analista', 'status': 'active'},
            {'id': viewer_id, 'auth_user_id': viewer_auth_id, 'email': 'lector@test.example',
             'full_name': 'Lectura', 'role': 'solo_lectura', 'status': 'active'},
        ])
        conn.execute(audit_logs.insert(), [
            {'id': uuid4(), 'actor_id': admin_id, 'action': 'identity.user.updated',
             'entity_type': 'users', 'entity_id': target_id,
             'before_json': {'role': 'solo_lectura'}, 'after_json': {'role': 'analista'},
             'result': 'success', 'occurred_at': now},
            {'id': uuid4(), 'actor_id': None, 'action': 'alert.generated',
             'entity_type': 'alerts', 'entity_id': uuid4(),
             'before_json': None, 'after_json': None,
             'result': 'success', 'occurred_at': now},
        ])

    app = FastAPI()
    app.include_router(router, prefix='/api/v1')
    app.dependency_overrides[get_read_engine] = lambda: engine
    monkeypatch.setattr(security, 'verify_supabase_token',
                        lambda token: viewer_auth_id if token == 'viewer' else admin_auth_id)
    yield TestClient(app)
    app.dependency_overrides.clear()
    engine.dispose()


def test_auditoria_muestra_actor_rol_y_cuenta_afectada(audit_setup):
    """Las claves anteriores se mantienen; los nuevos nombres tienen origen BD."""
    response = audit_setup.get('/api/v1/admin/audit', headers={'Authorization': 'Bearer admin'})
    assert response.status_code == 200
    items = response.json()['items']
    changed = next(row for row in items if row['action'] == 'identity.user.updated')
    assert changed['actor_name'] == 'Ana Torres'
    assert changed['actor_role'] == 'administrador'
    assert changed['subject_name'] == 'Luis Gómez'
    assert changed['before_json']['role'] == 'solo_lectura'
    system = next(row for row in items if row['action'] == 'alert.generated')
    assert system['actor_id'] is None
    assert system['actor_name'] is None
    assert system['actor_role'] is None
    assert system['subject_name'] is None


def test_auditoria_protegida_con_rbac(audit_setup):
    """La presentación no abre los registros a usuarios de solo lectura."""
    assert audit_setup.get('/api/v1/admin/audit').status_code == 401
    assert audit_setup.get('/api/v1/admin/audit',
                           headers={'Authorization': 'Bearer viewer'}).status_code == 403


def test_auditoria_filtros_y_paginacion(audit_setup):
    """Filtros y contadores reales, sin romper el contrato de fases anteriores."""
    token = {'Authorization':'Bearer admin'}
    response = audit_setup.get('/api/v1/admin/audit?page=1&page_size=5&category=usuarios&q=Ana',headers=token)
    assert response.status_code == 200
    data = response.json()
    assert data['page_size'] == 5
    assert data['total'] == 1
    assert data['pages'] == 1
    assert data['summary']['correctos'] == 1
    assert data['items'][0]['action'] == 'identity.user.updated'
    assert data['items'][0]['correlation_id'] is None
    only_alerts = audit_setup.get('/api/v1/admin/audit?category=alertas&page_size=10',headers=token)
    assert only_alerts.status_code == 200
    assert only_alerts.json()['total'] == 1
    # FastAPI interpreta parámetros query como texto: 5, 10 y 20 deben aceptarse.
    for size in (5, 10, 20):
        valid = audit_setup.get(f'/api/v1/admin/audit?page_size={size}', headers=token)
        assert valid.status_code == 200
        assert valid.json()['page_size'] == size
    assert audit_setup.get('/api/v1/admin/audit?page_size=7',headers=token).status_code == 422
    assert audit_setup.get('/api/v1/admin/audit?start_date=2026-10-27&end_date=2026-10-26',headers=token).status_code == 422
