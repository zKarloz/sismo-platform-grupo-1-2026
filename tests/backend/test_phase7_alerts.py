"""Pruebas Fase 7 aisladas: nunca envían correo ni consultan Supabase real."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.alerts.service import (
    bootstrap_user, create_rule, activate_rule, simulate, evaluate,
    review, dispatch, acknowledge,
)
from app.db.tables import (metadata, sources, runs, events, users, alert_rules, alerts,
                           deliveries, audit_logs)
from app.db.session import get_read_engine
from app.auth.security import require_user, Principal
from app.main import app

NOW = datetime(2026, 10, 23, 19, 0, tzinfo=timezone.utc)
ZONE = {'min_lat': -19.5, 'max_lat': 0.5, 'min_lon': -84, 'max_lon': -68}


@pytest.fixture
def engine():
    db = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @event.listens_for(db, 'connect')
    def setup(connection, _):
        connection.execute("ATTACH DATABASE ':memory:' AS public")
        connection.create_function('gen_random_uuid', 0, lambda: uuid4().hex)
    metadata.create_all(db, tables=[users, sources, runs, events, alert_rules, alerts, deliveries, audit_logs])
    with db.begin() as conn:
        conn.execute(sources.insert().values(id=uuid4(), name='IGP/CENSIS', organization='IGP',
                 base_url='https://ultimosismo.igp.gob.pe', source_type='api', status='active'))
        conn.execute(sources.insert().values(id=uuid4(), name='USGS', organization='USGS',
                 base_url='https://earthquake.usgs.gov', source_type='api', status='active'))
    yield db
    db.dispose()


def add_event(db, *, magnitude=4.5, place='Andoas', age=1, source='IGP/CENSIS',
              arrived_age=0, depth=100, latitude=-2.68):
    with db.begin() as conn:
        source_id = conn.execute(select(sources.c.id).where(sources.c.name == source)).scalar_one()
        return conn.execute(events.insert().values(
            source_id=source_id, external_id=str(uuid4()), occurred_at=NOW - timedelta(hours=age),
            received_at=NOW - timedelta(hours=arrived_age),
            latitude=latitude, longitude=-77.23, magnitude=magnitude,
            depth_km=depth, place=place, source_url='https://igp.gob.pe/reporte',
            review_status='unreviewed',
        ).returning(events.c.id)).scalar_one()


def set_rule(db, **kwargs):
    bootstrap_user(db, email='operador@example.org', name='Operador')
    rid = create_rule(db, actor_email='operador@example.org', name=f'regla-{uuid4()}',
                      zone=ZONE, min_magnitude=4.0, **kwargs)
    activate_rule(db, rule_id=rid, actor_email='operador@example.org', enabled=True,
                  now=NOW - timedelta(minutes=30))
    return rid


def rows(db):
    with db.connect() as conn:
        return (conn.execute(select(alerts)).mappings().all(),
                conn.execute(select(deliveries)).mappings().all())


def test_simulation_never_creates_alert(engine):
    rid = set_rule(engine)
    ev_id = add_event(engine)
    assert simulate(engine, rule_id=rid, event_id=ev_id)['match'] is True
    assert rows(engine) == ([], [])


def test_rule_ignores_old_received_and_old_occurred(engine):
    set_rule(engine)
    add_event(engine, arrived_age=2)   # Recibido ANTES de activación
    add_event(engine, age=48)           # Evento remoto histórico
    assert evaluate(engine, now=NOW)['generated'] == 0


def test_rule_respects_source_magnitude_depth_zone_and_hours(engine):
    rid = set_rule(engine, max_depth_km=150, start_hour_peru=10, end_hour_peru=18)
    add_event(engine, magnitude=3.4)
    add_event(engine, magnitude=4.4, depth=200)
    add_event(engine, magnitude=4.4, latitude=5)
    add_event(engine, magnitude=4.4, source='USGS')
    # 18 UTC = 13 Perú, válido
    valid = add_event(engine, magnitude=4.4)
    out = evaluate(engine, now=NOW)
    assert out['generated'] == 1
    with engine.connect() as conn:
        assert conn.execute(select(alerts.c.event_id)).scalar_one() == valid


def test_approval_dispatch_idempotency_and_audit(engine):
    rid = set_rule(engine)
    event_id = add_event(engine)
    assert evaluate(engine, now=NOW)['generated'] == 1
    assert evaluate(engine, now=NOW)['generated'] == 0
    initial, delivery = rows(engine)
    assert len(initial) == len(delivery) == 1 and initial[0]['status'] == 'pending'
    assert dispatch(engine, now=NOW)['sent'] == 0
    aid = initial[0]['id']
    review(engine, alert_id=aid, actor_email='operador@example.org', approve=True, now=NOW)
    assert dispatch(engine, now=NOW)['sent'] == 1
    assert dispatch(engine, now=NOW)['sent'] == 0
    after, sent = rows(engine)
    assert after[0]['status'] == 'sent' and sent[0]['attempts'] == 1
    assert 'no es una alerta oficial' in after[0]['message'].lower()
    acknowledge(engine, delivery_id=sent[0]['id'], actor_email='operador@example.org', now=NOW)
    with engine.connect() as conn:
        actions = conn.execute(select(audit_logs.c.action)).scalars().all()
    assert {'alert.generated','alert.approved','alert.delivery.sent','alert.delivery.acknowledged'}.issubset(set(actions))


def test_rule_cooldown_restricts_two_events(engine):
    set_rule(engine, cooldown_seconds=3600, requires_approval=False)
    add_event(engine, place='Evento 1')
    add_event(engine, place='Evento 2')
    assert evaluate(engine, now=NOW)['generated'] == 1
    assert dispatch(engine, now=NOW)['sent'] == 1


def test_email_requires_approval_and_optin(engine):
    with pytest.raises(ValueError):
        set_rule(engine, channel='email', destination='prueba@example.org', requires_approval=False)
    set_rule(engine, channel='email', destination='prueba@example.org')
    add_event(engine)
    assert evaluate(engine, now=NOW)['generated'] == 1
    assert dispatch(engine, now=NOW)['sent'] == 0
    aid = rows(engine)[0][0]['id']
    review(engine, alert_id=aid, actor_email='operador@example.org', approve=True, now=NOW)
    assert dispatch(engine, now=NOW, send_email=False)['sent'] == 0
    assert dispatch(engine, now=NOW, send_email=True, mailer=lambda *args: None)['sent'] == 1


def test_email_retries_backoff_max_three(engine):
    set_rule(engine, channel='email', destination='prueba@example.org')
    add_event(engine)
    evaluate(engine, now=NOW)
    aid = rows(engine)[0][0]['id']
    review(engine, alert_id=aid, actor_email='operador@example.org', approve=True, now=NOW)
    def fail(*args):
        raise RuntimeError('no disponible')
    assert dispatch(engine, now=NOW, send_email=True, mailer=fail)['failed'] == 1
    assert dispatch(engine, now=NOW, send_email=True, mailer=fail)['failed'] == 0
    assert dispatch(engine, now=NOW + timedelta(minutes=2), send_email=True, mailer=fail)['failed'] == 1
    assert dispatch(engine, now=NOW + timedelta(minutes=6), send_email=True, mailer=fail)['failed'] == 1
    assert dispatch(engine, now=NOW + timedelta(minutes=12), send_email=True, mailer=fail)['failed'] == 0
    with engine.connect() as conn:
        d = conn.execute(select(deliveries)).mappings().one()
        assert d['status'] == 'failed' and d['attempts'] == 3
        assert d['error_code'] == 'SMTP_SEND_FAILED'


def test_authenticated_read_only_api_hides_destination(engine):
    set_rule(engine, channel='email', destination='secreto@example.org')
    add_event(engine)
    evaluate(engine, now=NOW)
    app.dependency_overrides[get_read_engine] = lambda: engine
    try:
        client = TestClient(app)
        assert client.get('/api/v1/alert-rules').status_code == 401
        assert client.get('/api/v1/alerts').status_code == 401
        app.dependency_overrides[require_user] = lambda: Principal(
            id=uuid4(), auth_user_id=uuid4(), email='lector@example.org',
            full_name='Lector', role='solo_lectura', status='active')
        res = client.get('/api/v1/alert-rules')
        assert res.status_code == 200 and len(res.json()['items']) == 1
        history = client.get('/api/v1/alerts')
        assert history.status_code == 200 and history.json()['total'] == 1
        assert 'secreto@example.org' not in history.text
        assert client.post('/api/v1/alert-rules').status_code == 405
        assert client.post('/api/v1/alerts').status_code == 405
    finally:
        app.dependency_overrides.clear()
