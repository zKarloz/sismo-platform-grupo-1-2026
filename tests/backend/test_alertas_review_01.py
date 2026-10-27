"""Revisión de dos módulos: lecturas protegidas, fuente IGP y simulación sin envíos."""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.pool import StaticPool

from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.db.tables import (metadata, users, sources, events, alert_rules, alerts,
                           deliveries, audit_logs)
from app.main import app


def test_igp_scoped_alerts_are_paginated_and_private():
    engine = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @event.listens_for(engine, 'connect')
    def setup(dbapi, _):
        dbapi.execute("ATTACH DATABASE ':memory:' AS public")
        dbapi.create_function('gen_random_uuid', 0, lambda: uuid4().hex)
    metadata.create_all(engine, tables=[users, sources, events, alert_rules, alerts, deliveries, audit_logs])
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        for source_name in ('IGP/CENSIS', 'USGS'):
            sid, eid, rid, aid = uuid4(), uuid4(), uuid4(), uuid4()
            conn.execute(sources.insert().values(id=sid, name=source_name,
                organization='IGP', base_url='https://igp.gob.pe', source_type='api', status='active'))
            conn.execute(events.insert().values(id=eid, source_id=sid, external_id=str(uuid4()),
                occurred_at=now, received_at=now, latitude=-12, longitude=-77, magnitude=4.5,
                place='Perú', source_url='https://igp.gob.pe', review_status='unreviewed'))
            conn.execute(alert_rules.insert().values(id=rid, name=f'regla-{source_name}', source_id=sid,
                min_magnitude=4.0, zone_spec={}, severity='info', channel='email',
                destination_ref='secreto@gmail.com', enabled=True, requires_approval=True,
                cooldown_seconds=900, template_title='test', template_body='test', created_at=now))
            conn.execute(alerts.insert().values(id=aid, event_id=eid, rule_id=rid,
                severity='info', title='Sismo', message='Mensaje informativo',
                source_url='https://igp.gob.pe', status='failed', created_at=now))
            conn.execute(deliveries.insert().values(id=uuid4(), alert_id=aid,
                channel='email', destination_ref='secreto@gmail.com', status='failed',
                attempts=2, error_code='SMTP_SEND_FAILED', created_at=now))
    app.dependency_overrides[get_read_engine] = lambda: engine
    try:
        client = TestClient(app)
        assert client.get('/api/v1/alerts').status_code == 401
        assert client.get('/api/v1/alert-rules').status_code == 401
        app.dependency_overrides[require_user] = lambda: Principal(
            id=uuid4(), auth_user_id=uuid4(), email='viewer@test.com',
            full_name='Lector', role='solo_lectura', status='active')
        rules = client.get('/api/v1/alert-rules').json()['items']
        assert len(rules) == 1 and rules[0]['source_name'] == 'IGP/CENSIS'
        assert 'destination_ref' not in rules[0]
        response = client.get('/api/v1/alerts?page=1&page_size=5')
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['total'] == 1 and len(result['items']) == 1
        assert result['items'][0]['source_name'] == 'IGP/CENSIS'
        assert result['items'][0]['delivery']['error_code'] == 'SMTP_SEND_FAILED'
        assert 'secreto@gmail.com' not in response.text
        assert client.get('/api/v1/admin/alert-rules/simulation/events').status_code == 403
        app.dependency_overrides[require_user] = lambda: Principal(
            id=uuid4(), auth_user_id=uuid4(), email='analyst@test.com',
            full_name='Analista', role='analista', status='active')
        simulation_events = client.get('/api/v1/admin/alert-rules/simulation/events')
        assert simulation_events.status_code == 200, simulation_events.text
        assert len(simulation_events.json()['items']) == 1
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
