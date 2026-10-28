"""Fase E: seguridad de caducidad y lotes del correo operativo.

Pruebas locales sin servidor SMTP, credenciales ni PostgreSQL remoto.
"""
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.alerts import service
from app.db.tables import deliveries, events
from test_centro_alertas_fase_c import NOW, engine, seed, delivery


def _set_occurrence(engine, event_time):
    """El evento de prueba es único: modificar solo la fecha de ocurrencia."""
    with engine.begin() as conn:
        conn.execute(events.update().values(occurred_at=event_time))


def test_expired_email_cancels_and_preserves_audit(engine, monkeypatch):
    seed(engine)
    _set_occurrence(engine, NOW - timedelta(hours=6, seconds=1))
    monkeypatch.delenv('OPERATIONAL_EMAIL_MAX_AGE_HOURS', raising=False)
    result = service.dispatch(engine, now=NOW, send_email=True,
                              mailer=lambda *_: pytest.fail('No enviar correo histórico'))
    assert result['sent'] == 0 and result['expired'] == 1
    row = delivery(engine)
    assert row['status'] == 'cancelled' and row['error_code'] == service.EMAIL_EXPIRED
    assert row['attempts'] == 0 and row['next_attempt_at'] is None
    assert service.dispatch(engine, now=NOW, send_email=True,
                            mailer=lambda *_: pytest.fail('Duplicado'))['expired'] == 0


def test_fresh_event_can_be_emailed_approved(engine, monkeypatch):
    seed(engine)
    _set_occurrence(engine, NOW - timedelta(hours=5, minutes=59))
    monkeypatch.delenv('OPERATIONAL_EMAIL_MAX_AGE_HOURS', raising=False)
    destinations = []
    result = service.dispatch(engine, now=NOW, send_email=True,
                              mailer=lambda dest, *_: destinations.append(dest))
    assert result['sent'] == 1 and result['expired'] == 0
    assert destinations == ['destino@example.com']


def test_future_date_never_sends(engine):
    seed(engine)
    _set_occurrence(engine, NOW + timedelta(minutes=6))
    result = service.dispatch(engine, now=NOW, send_email=True,
                              mailer=lambda *_: pytest.fail('Evento con fecha futura'))
    assert result['sent'] == 0 and delivery(engine)['attempts'] == 0


def test_old_uncertain_email_is_preserved_for_manual_review(engine):
    seed(engine, code=service.SMTP_OUTCOME_UNKNOWN, attempts=1)
    _set_occurrence(engine, NOW - timedelta(days=2))
    result = service.dispatch(engine, now=NOW, send_email=True,
                              mailer=lambda *_: pytest.fail('Reenvío prohibido'))
    assert result['expired'] == 0 and result['sent'] == 0
    assert delivery(engine)['error_code'] == service.SMTP_OUTCOME_UNKNOWN


def test_age_override_must_fail_closed(engine, monkeypatch):
    seed(engine)
    monkeypatch.setenv('OPERATIONAL_EMAIL_MAX_AGE_HOURS', '0')
    with pytest.raises(ValueError, match='MAX_AGE_HOURS'):
        service.dispatch(engine, now=NOW, send_email=True,
                         mailer=lambda *_: pytest.fail('Inválido'))
    assert delivery(engine)['attempts'] == 0


def test_disabled_external_transport_does_not_expire_old_email(engine):
    seed(engine)
    _set_occurrence(engine, NOW - timedelta(days=2))
    result = service.dispatch(engine, now=NOW, send_email=False,
                              mailer=lambda *_: pytest.fail('No SMTP'))
    assert result['expired'] == 0 and delivery(engine)['status'] == 'pending'


def test_cron_send_batch_is_limited_to_ten(engine, monkeypatch):
    for _ in range(12):
        seed(engine)
    monkeypatch.delenv('OPERATIONAL_EMAIL_BATCH_LIMIT', raising=False)
    recipients = []
    result = service.dispatch(engine, now=NOW, send_email=True,
                              mailer=lambda dest, *_: recipients.append(dest))
    assert result['sent'] == 10 and len(recipients) == 10
    with engine.connect() as conn:
        rows = conn.execute(select(deliveries.c.status)).scalars().all()
    assert rows.count('sent') == 10 and rows.count('pending') == 2


def test_invalid_batch_limit_does_not_claim(engine, monkeypatch):
    seed(engine)
    monkeypatch.setenv('OPERATIONAL_EMAIL_BATCH_LIMIT', '1000')
    with pytest.raises(ValueError, match='BATCH_LIMIT'):
        service.dispatch(engine, now=NOW, send_email=True,
                         mailer=lambda *_: pytest.fail('No SMTP'))
    assert delivery(engine)['attempts'] == 0


def test_manual_test_expiry_only_affects_selected_recipient(engine, monkeypatch):
    first, _, _ = seed(engine)
    second, _, _ = seed(engine)
    with engine.begin() as conn:
        conn.execute(deliveries.update().where(deliveries.c.id == second).values(destination_ref='otro@example.com'))
        conn.execute(events.update().values(occurred_at=NOW-timedelta(hours=7)))
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_MODE', 'true')
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_RECIPIENT', 'destino@example.com')
    result = service.dispatch(engine, now=NOW, send_email=True,
                              mailer=lambda *_: pytest.fail('Correo antiguo'))
    assert result['expired'] == 1
    with engine.connect() as conn:
        state = {r.id: r.status for r in conn.execute(select(deliveries.c.id, deliveries.c.status))}
    assert state[first] == 'cancelled' and state[second] == 'pending'
