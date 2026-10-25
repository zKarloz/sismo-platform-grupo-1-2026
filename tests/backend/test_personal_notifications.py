"""Pruebas sin llamadas de red ni SMTP real; roles y colas personales aislados."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, update
from sqlalchemy.pool import StaticPool

from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.db.tables import (metadata, users, sources, events, audit_logs,
                           notification_preferences, personal_deliveries)
from app.main import app
from app.notifications.service import evaluate, dispatch, history_for, set_preference

NOW = datetime(2026, 10, 24, 18, 0, tzinfo=timezone.utc)


@pytest.fixture
def db():
    engine = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False},
                           poolclass=StaticPool)
    @event.listens_for(engine, 'connect')
    def setup(dbapi_conn, _):
        dbapi_conn.execute("ATTACH DATABASE ':memory:' AS public")
        dbapi_conn.create_function('gen_random_uuid', 0, lambda: uuid4().hex)
    metadata.create_all(engine, tables=[users, sources, events, audit_logs,
                                        notification_preferences, personal_deliveries])
    with engine.begin() as conn:
        source_id = uuid4()
        conn.execute(sources.insert().values(id=source_id, name='IGP/CENSIS', organization='IGP',
            base_url='https://igp.gob.pe', source_type='api', status='active'))
        actor_id, other_id = uuid4(), uuid4()
        conn.execute(users.insert().values(id=actor_id, email='first@gmail.com',
            full_name='Primero', role='solo_lectura', status='active'))
        conn.execute(users.insert().values(id=other_id, email='second@gmail.com',
            full_name='Segundo', role='administrador', status='active'))
    yield engine, actor_id, other_id, source_id
    engine.dispose()


def add_event(engine, source_id, *, magnitude=4.2, occurred=NOW, received=NOW):
    with engine.begin() as conn:
        return conn.execute(events.insert().values(source_id=source_id, external_id=str(uuid4()),
            occurred_at=occurred, received_at=received,
            latitude=-12.2, longitude=-76.9, magnitude=magnitude,
            depth_km=25, place='Lima', source_url='https://igp.gob.pe/evento',
            review_status='unreviewed').returning(events.c.id)).scalar_one()


def test_defaults_to_disabled_and_no_backfill(db):
    engine, uid, _, source = db
    default = __import__('app.notifications.service', fromlist=['preference_for']).preference_for(engine, uid)
    assert default['enabled'] is False
    add_event(engine, source, received=NOW - timedelta(minutes=2))
    set_preference(engine, user_id=uid, enabled=True, min_magnitude=3.5, now=NOW)
    assert evaluate(engine, now=NOW)['queued'] == 0
    add_event(engine, source, received=NOW + timedelta(minutes=1), magnitude=3.6)
    assert evaluate(engine, now=NOW + timedelta(minutes=1))['queued'] == 1
    assert evaluate(engine, now=NOW + timedelta(minutes=1))['queued'] == 0


def test_threshold_and_personal_isolation(db):
    engine, uid, other_id, source = db
    set_preference(engine, user_id=uid, enabled=True, min_magnitude=4.0, now=NOW)
    set_preference(engine, user_id=other_id, enabled=True, min_magnitude=5.0, now=NOW)
    add_event(engine, source, magnitude=3.6, received=NOW + timedelta(minutes=1))
    add_event(engine, source, magnitude=4.4, received=NOW + timedelta(minutes=1))
    result = evaluate(engine, now=NOW + timedelta(minutes=1))
    assert result['queued'] == 1
    assert history_for(engine, user_id=uid)['total'] == 1
    assert history_for(engine, user_id=other_id)['total'] == 0


def test_opt_out_cancels_unsent_and_magnitude_change_resets(db):
    engine, uid, _, source = db
    set_preference(engine, user_id=uid, enabled=True, min_magnitude=3.5, now=NOW)
    add_event(engine, source, received=NOW + timedelta(minutes=1))
    assert evaluate(engine, now=NOW + timedelta(minutes=1))['queued'] == 1
    set_preference(engine, user_id=uid, enabled=False, min_magnitude=3.5,
                   now=NOW + timedelta(minutes=2))
    with engine.connect() as conn:
        assert conn.execute(select(personal_deliveries.c.status)).scalar_one() == 'cancelled'
    assert dispatch(engine, now=NOW + timedelta(minutes=3), send_email=True,
                    mailer=lambda *_: pytest.fail('Nunca enviar sin consentimiento'))['sent'] == 0
    set_preference(engine, user_id=uid, enabled=True, min_magnitude=5.5,
                   now=NOW + timedelta(minutes=4))
    assert evaluate(engine, now=NOW + timedelta(minutes=5))['queued'] == 0


def test_send_retry_and_no_duplicate(db):
    engine, uid, _, source = db
    set_preference(engine, user_id=uid, enabled=True, min_magnitude=3.5, now=NOW)
    add_event(engine, source, received=NOW + timedelta(minutes=1))
    evaluate(engine, now=NOW + timedelta(minutes=1))
    assert dispatch(engine, now=NOW + timedelta(minutes=1), send_email=False)['sent'] == 0
    def fail(*_): raise RuntimeError('secreto-jamás-en-el-log')
    assert dispatch(engine, now=NOW + timedelta(minutes=2), send_email=True, mailer=fail)['failed'] == 1
    with engine.connect() as conn:
        one = conn.execute(select(personal_deliveries)).mappings().one()
        assert one['status'] == 'failed' and one['error_code'] == 'SMTP_SEND_FAILED'
    emails = []
    assert dispatch(engine, now=NOW + timedelta(minutes=3), send_email=True,
                    mailer=lambda *args: emails.append(args))['sent'] == 0
    assert dispatch(engine, now=NOW + timedelta(minutes=5), send_email=True,
                    mailer=lambda *args: emails.append(args))['sent'] == 1
    assert len(emails) == 1 and emails[0][0] == 'first@gmail.com'
    assert dispatch(engine, now=NOW + timedelta(minutes=6), send_email=True,
                    mailer=lambda *args: emails.append(args))['sent'] == 0
    assert len(emails) == 1
    with engine.connect() as conn:
        assert 'secreto' not in str(conn.execute(select(personal_deliveries.c.error_code)).scalar_one())


def test_reserved_email_cannot_subscribe(db):
    engine, uid, _, _ = db
    with engine.begin() as conn:
        conn.execute(update(users).where(users.c.id == uid).values(email='cuenta@proyecto.test'))
    with pytest.raises(ValueError, match='correo real'):
        set_preference(engine, user_id=uid, enabled=True, min_magnitude=3.5, now=NOW)
    with pytest.raises(ValueError, match='magnitud'):
        set_preference(engine, user_id=uid, enabled=False, min_magnitude=1, now=NOW)


def test_api_only_authenticated_self_even_for_read_only(db):
    engine, uid, other, _ = db
    client = TestClient(app)
    app.dependency_overrides[get_read_engine] = lambda: engine
    app.dependency_overrides[require_user] = lambda: Principal(
        id=uid, auth_user_id=uuid4(), email='first@gmail.com', full_name='Primero',
        role='solo_lectura', status='active')
    try:
        result = client.patch('/api/v1/me/notifications', json={'enabled': True, 'min_magnitude': 3.5})
        assert result.status_code == 200 and result.json()['enabled'] is True
        deny = client.patch('/api/v1/me/notifications', json={
            'enabled': True, 'min_magnitude': 3.5, 'user_id': str(other)})
        assert deny.status_code == 422
        history = client.get('/api/v1/me/notifications/history?page=1&page_size=10')
        assert history.status_code == 200 and history.json()['total'] == 0
    finally:
        app.dependency_overrides.clear()
    # Sin token: no acceso al historial personal incluso con BD disponible.
    app.dependency_overrides[get_read_engine] = lambda: engine
    try:
        assert client.get('/api/v1/me/notifications').status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_future_and_old_events_rejected(db):
    engine, uid, _, source = db
    set_preference(engine, user_id=uid, enabled=True, min_magnitude=2.0, now=NOW)
    add_event(engine, source, received=NOW + timedelta(minutes=1),
              occurred=NOW - timedelta(days=2))
    add_event(engine, source, received=NOW + timedelta(minutes=1),
              occurred=NOW + timedelta(hours=2))
    assert evaluate(engine, now=NOW + timedelta(minutes=1))['queued'] == 0


def test_history_is_paginated_without_exposing_recipient(db):
    engine, uid, _, source = db
    set_preference(engine, user_id=uid, enabled=True, min_magnitude=3.5, now=NOW)
    for n in range(7):
        add_event(engine, source, received=NOW + timedelta(seconds=n+1))
    assert evaluate(engine, now=NOW + timedelta(minutes=1))['queued'] == 7
    first = history_for(engine, user_id=uid, page=1, page_size=5)
    second = history_for(engine, user_id=uid, page=2, page_size=5)
    assert (first['total'], len(first['items']), len(second['items']), first['pages']) == (7, 5, 2, 2)
    assert all('email' not in item and 'destination_ref' not in item for item in first['items'])


def test_maximum_attempts_with_generic_error(db):
    engine, uid, _, source = db
    set_preference(engine, user_id=uid, enabled=True, min_magnitude=3.5, now=NOW)
    add_event(engine, source, received=NOW + timedelta(seconds=1))
    evaluate(engine, now=NOW + timedelta(minutes=1))
    def failing(*_):
        raise RuntimeError('supersecreto')
    for minute in (2, 5, 10):
        assert dispatch(engine, now=NOW + timedelta(minutes=minute), send_email=True, mailer=failing)['failed'] == 1
    assert dispatch(engine, now=NOW + timedelta(minutes=30), send_email=True, mailer=failing)['failed'] == 0
    with engine.connect() as conn:
        row = conn.execute(select(personal_deliveries)).mappings().one()
        assert row['attempts'] == 3 and row['status'] == 'failed'
        assert row['error_code'] == 'SMTP_SEND_FAILED'
