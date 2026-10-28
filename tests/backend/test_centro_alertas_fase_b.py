"""Fase B: consultas reales de alert_deliveries sin SMTP ni Supabase externos.

Se usa SQLite con el esquema 'public' simulado. Ninguna prueba envía correos.
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.db.tables import metadata, users, sources, events, alert_rules, alerts, deliveries
from app.main import app


NOW = datetime(2026, 10, 27, 17, 0, tzinfo=timezone.utc)


@pytest.fixture
def seeded():
    """Dos entregas IGP, una USGS y destinatarios privados intencionados."""
    engine = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)

    @event.listens_for(engine, 'connect')
    def setup(conn, _):
        conn.execute("ATTACH DATABASE ':memory:' AS public")
        conn.create_function('gen_random_uuid', 0, lambda: uuid4().hex)

    metadata.create_all(engine, tables=[users, sources, events, alert_rules, alerts, deliveries])
    with engine.begin() as conn:
        for source_name in ('IGP/CENSIS', 'USGS'):
            sid, eid, rid, aid = uuid4(), uuid4(), uuid4(), uuid4()
            conn.execute(sources.insert().values(id=sid, name=source_name,
                organization='Proveedor', base_url='https://igp.gob.pe', source_type='api', status='active'))
            conn.execute(events.insert().values(id=eid, source_id=sid, external_id=str(uuid4()),
                occurred_at=NOW, latitude=-12, longitude=-77, magnitude=3.7,
                place='Perú', source_url='https://ultimosismo.igp.gob.pe', review_status='unreviewed'))
            conn.execute(alert_rules.insert().values(id=rid, source_id=sid, name=f'regla-{source_name}',
                min_magnitude=3.5, zone_spec={}, severity='review', channel='email',
                cooldown_seconds=0, enabled=True, requires_approval=True, created_at=NOW))
            conn.execute(alerts.insert().values(id=aid, event_id=eid, rule_id=rid,
                title=f'Evento {source_name}', message='Aviso informativo',
                severity='review', source_url='https://ultimosismo.igp.gob.pe',
                status='sent', created_at=NOW))
            conn.execute(deliveries.insert().values(id=uuid4(), alert_id=aid, channel='email',
                destination_ref='privado@example.com', status='sent', attempts=1,
                delivered_at=NOW, created_at=NOW))
            if source_name == 'IGP/CENSIS':
                conn.execute(deliveries.insert().values(id=uuid4(), alert_id=aid, channel='in_app',
                    destination_ref='centro-interno', status='failed', attempts=2,
                    last_attempt_at=NOW, next_attempt_at=NOW + timedelta(minutes=3),
                    error_code='SMTP_PRIVADO=contraseña@correo.com', created_at=NOW - timedelta(minutes=2)))
    app.dependency_overrides[get_read_engine] = lambda: engine
    yield engine
    app.dependency_overrides.clear()
    engine.dispose()


def actor(role):
    return Principal(id=uuid4(), auth_user_id=uuid4(), email='tester@example.com',
                     full_name='Tester', role=role, status='active')


def test_deliveries_requires_session_and_operational_role(seeded):
    client = TestClient(app)
    assert client.get('/api/v1/alert-deliveries').status_code == 401
    for forbidden in ('solo_lectura', 'analista'):
        app.dependency_overrides[require_user] = lambda role=forbidden: actor(role)
        assert client.get('/api/v1/alert-deliveries').status_code == 403
    for permitted in ('administrador', 'operador_alertas', 'auditor'):
        app.dependency_overrides[require_user] = lambda role=permitted: actor(role)
        assert client.get('/api/v1/alert-deliveries').status_code == 200


def test_only_igp_and_no_full_email_or_raw_smtp_errors(seeded):
    app.dependency_overrides[require_user] = lambda: actor('auditor')
    response = TestClient(app).get('/api/v1/alert-deliveries')
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['total'] == 2 and len(data['items']) == 2
    assert data['page'] == 1 and data['page_size'] == 5
    assert 'privado@example.com' not in response.text
    assert 'SMTP_PRIVADO' not in response.text and 'contraseña' not in response.text
    assert 'USGS' not in response.text
    assert {item['destination_display'] for item in data['items']} == {'p***@example.com', 'Centro interno'}
    assert 'destination_ref' not in data['items'][0]
    assert next(item for item in data['items'] if item['status'] == 'failed')['error_code'] == 'ERROR_NO_CLASIFICADO'
    assert all('alert_title' in item and 'delivered_at' in item for item in data['items'])


def test_pagination_filters_and_validation(seeded):
    app.dependency_overrides[require_user] = lambda: actor('operador_alertas')
    client = TestClient(app)
    first = client.get('/api/v1/alert-deliveries?page=1&page_size=1')
    second = client.get('/api/v1/alert-deliveries?page=2&page_size=1')
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()['total'] == second.json()['total'] == 2
    assert first.json()['items'][0]['id'] != second.json()['items'][0]['id']
    filtered = client.get('/api/v1/alert-deliveries?status=sent&channel=email')
    assert filtered.status_code == 200 and filtered.json()['total'] == 1
    empty = client.get('/api/v1/alert-deliveries?status=cancelled')
    assert empty.status_code == 200 and empty.json()['total'] == 0
    for params in ('page=0', 'page_size=21', 'channel=other', 'status=approved'):
        assert client.get('/api/v1/alert-deliveries?' + params).status_code == 422
