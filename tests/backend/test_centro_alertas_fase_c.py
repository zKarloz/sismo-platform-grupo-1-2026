"""Pruebas de seguridad para Fase C: sin red, sin SMTP real, sin Supabase.

La reserva CAS se verifica con un reingreso al despachador desde el mailer;
las condiciones UPDATE son válidas tanto en SQLite como en PostgreSQL.
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.pool import StaticPool

from app.alerts import service
from app.db.tables import metadata, sources, users, events, alert_rules, alerts, deliveries, audit_logs

NOW = datetime(2026, 10, 27, 19, 0, tzinfo=timezone.utc)


@pytest.fixture
def engine():
    db = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)

    @event.listens_for(db, 'connect')
    def setup(conn, _):
        conn.execute("ATTACH DATABASE ':memory:' AS public")
        conn.create_function('gen_random_uuid', 0, lambda: uuid4().hex)

    metadata.create_all(db, tables=[users, sources, events, alert_rules, alerts, deliveries, audit_logs])
    yield db
    db.dispose()


def seed(engine, *, channel='email', source='IGP/CENSIS', rule_enabled=True,
         status='approved', reviewed=True, code=None, attempts=0, when=None):
    sid, uid, event_id, rule_id, alert_id, delivery_id = [uuid4() for _ in range(6)]
    with engine.begin() as conn:
        conn.execute(users.insert().values(id=uid, email=f'{uid}@example.com', full_name='Admin',
                                          role='administrador', status='active'))
        conn.execute(sources.insert().values(id=sid, name=source, organization='Proveedor',
                                             base_url='https://igp.gob.pe', source_type='api', status='active'))
        conn.execute(events.insert().values(id=event_id, source_id=sid, external_id=str(uuid4()),
                                            occurred_at=NOW, received_at=NOW, latitude=-12, longitude=-77,
                                            magnitude=4.2, depth_km=25, place='Perú',
                                            source_url='https://ultimosismo.igp.gob.pe', review_status='unreviewed'))
        conn.execute(alert_rules.insert().values(id=rule_id, name=str(uuid4()), source_id=sid,
                                              min_magnitude=3.5, zone_spec={}, severity='review',
                                              channel=channel, destination_ref='destino@example.com',
                                              cooldown_seconds=0, enabled=rule_enabled,
                                              requires_approval=True, activated_at=NOW, created_at=NOW))
        conn.execute(alerts.insert().values(id=alert_id, event_id=event_id, rule_id=rule_id,
                                           title='Sismo IGP', message='Aviso informativo',
                                           source_url='https://ultimosismo.igp.gob.pe', severity='review',
                                           status=status, approved_by=uid if reviewed else None,
                                           approved_at=NOW if reviewed else None, created_at=NOW))
        conn.execute(deliveries.insert().values(id=delivery_id, alert_id=alert_id,
                                               channel=channel, destination_ref='destino@example.com',
                                               status='failed' if code else 'pending', attempts=attempts,
                                               next_attempt_at=when, error_code=code, created_at=NOW))
    return delivery_id, alert_id, f'{uid}@example.com'


def delivery(engine):
    with engine.connect() as conn:
        return conn.execute(select(deliveries)).mappings().one()


def test_does_not_email_without_explicit_flag(engine):
    seed(engine)
    calls = []
    assert service.dispatch(engine, now=NOW, mailer=lambda *args: calls.append(args))['sent'] == 0
    assert calls == [] and delivery(engine)['attempts'] == 0


def test_preapproval_cancellation_and_disabled_rule_block_email(engine):
    _, aid, _ = seed(engine, status='pending', reviewed=False)
    assert service.dispatch(engine, now=NOW, send_email=True, mailer=lambda *args: pytest.fail('mail'))['sent'] == 0
    with engine.begin() as conn:
        conn.execute(alerts.update().where(alerts.c.id == aid).values(status='approved'))
    # Estado aprobado manualmente sin approved_by/approved_at no es suficiente.
    assert service.dispatch(engine, now=NOW, send_email=True, mailer=lambda *args: pytest.fail('mail'))['sent'] == 0


def test_outside_igp_does_not_send(engine):
    seed(engine, source='USGS')
    assert service.dispatch(engine, now=NOW, send_email=True, mailer=lambda *args: pytest.fail('mail'))['sent'] == 0


def test_rule_disabled_does_not_send(engine):
    seed(engine, rule_enabled=False)
    assert service.dispatch(engine, now=NOW, send_email=True, mailer=lambda *args: pytest.fail('mail'))['sent'] == 0


def test_atomic_claim_prevents_nested_simultaneous_mailers(engine):
    seed(engine)
    calls = []

    def mailer(destination, title, body):
        calls.append((destination, title, body))
        # En una segunda ejecución, el registro ya está reservado y confirmado.
        nested = service.dispatch(engine, now=NOW, send_email=True, mailer=lambda *args: calls.append(args))
        assert nested['sent'] == nested['failed'] == nested['uncertain'] == 0

    assert service.dispatch(engine, now=NOW, send_email=True, mailer=mailer)['sent'] == 1
    assert len(calls) == 1
    assert service.dispatch(engine, now=NOW, send_email=True, mailer=mailer)['sent'] == 0
    assert delivery(engine)['status'] == 'sent' and delivery(engine)['attempts'] == 1
    with engine.connect() as conn:
        actions = conn.execute(select(audit_logs.c.action)).scalars().all()
    assert 'alert.delivery.claimed' in actions and 'alert.delivery.sent' in actions


def test_unknown_smtp_outcome_never_automatically_retries(engine, monkeypatch):
    seed(engine)
    calls = []

    def accepted_but_timeout(*args):
        calls.append('could-have-sent')
        raise RuntimeError('SMTP timeout: password and destination should not leak')

    monkeypatch.setattr(service, '_send_email', accepted_but_timeout)
    result = service.dispatch(engine, now=NOW, send_email=True)
    assert result['uncertain'] == 1 and result['failed'] == 0
    row = delivery(engine)
    assert row['status'] == 'failed' and row['attempts'] == 1
    assert row['error_code'] == 'SMTP_OUTCOME_UNKNOWN' and row['next_attempt_at'] is None
    assert service.dispatch(engine, now=NOW + timedelta(days=5), send_email=True)['sent'] == 0
    assert calls == ['could-have-sent']
    with engine.connect() as conn:
        assert 'password' not in str(conn.execute(select(audit_logs)).mappings().all())


def test_crash_after_commit_does_not_resend(engine):
    seed(engine)
    class Crash(BaseException):
        pass

    def crash(*_):
        raise Crash()

    with pytest.raises(Crash):
        service.dispatch(engine, now=NOW, send_email=True, mailer=crash)
    assert delivery(engine)['error_code'] == 'SMTP_OUTCOME_UNKNOWN'
    assert service.dispatch(engine, now=NOW + timedelta(minutes=30), send_email=True,
                            mailer=lambda *args: pytest.fail('duplicate'))['sent'] == 0


def test_pre_submission_failure_retries_only_on_due_schedule(engine, monkeypatch):
    seed(engine)
    calls = []

    def fail_before_submission(*args):
        calls.append(1)
        raise service.SMTPBeforeSubmissionError('offline')

    monkeypatch.setattr(service, '_send_email', fail_before_submission)
    assert service.dispatch(engine, now=NOW, send_email=True)['failed'] == 1
    assert service.dispatch(engine, now=NOW, send_email=True)['failed'] == 0
    assert service.dispatch(engine, now=NOW + timedelta(minutes=2), send_email=True)['failed'] == 1
    assert service.dispatch(engine, now=NOW + timedelta(minutes=6), send_email=True)['failed'] == 1
    assert service.dispatch(engine, now=NOW + timedelta(hours=1), send_email=True)['failed'] == 0
    assert len(calls) == 3 and delivery(engine)['attempts'] == 3
    assert delivery(engine)['error_code'] == 'SMTP_SEND_FAILED'


def test_in_app_is_atomic_and_never_uses_mailer(engine):
    seed(engine, channel='in_app', reviewed=False)
    assert service.dispatch(engine, now=NOW, mailer=lambda *args: pytest.fail('mail'))['sent'] == 1
    assert service.dispatch(engine, now=NOW)['sent'] == 0
    assert delivery(engine)['status'] == 'sent'


def test_only_pending_reviewed_once_and_ack_once(engine):
    did, aid, email = seed(engine, status='pending', reviewed=False, channel='in_app')
    service.review(engine, alert_id=aid, actor_email=email, approve=True, now=NOW)
    with pytest.raises(ValueError):
        service.review(engine, alert_id=aid, actor_email=email, approve=False, now=NOW)
    service.dispatch(engine, now=NOW)
    service.acknowledge(engine, delivery_id=did, actor_email=email, now=NOW)
    with pytest.raises(ValueError):
        service.acknowledge(engine, delivery_id=did, actor_email=email, now=NOW)
    with engine.connect() as conn:
        actions = conn.execute(select(audit_logs.c.action)).scalars().all()
    assert actions.count('alert.approved') == 1 and actions.count('alert.delivery.acknowledged') == 1
