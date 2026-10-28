"""Pruebas Fase D: selección de destino, capacidad unitaria y bloqueo sin habilitación.

Sin Gmail, red, Supabase ni claves reales. Reutiliza los fixtures de Fase C.
"""

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.alerts import service
from app.db.tables import alerts, deliveries
from test_centro_alertas_fase_c import NOW, engine, seed


def _all_deliveries(engine):
    with engine.connect() as connection:
        return connection.execute(select(deliveries)).mappings().all()


def test_manual_mode_only_one_matching_recipient_email(engine, monkeypatch):
    seed(engine)  # destinatario permitido
    other_id, _, _ = seed(engine)
    with engine.begin() as conn:
        conn.execute(deliveries.update().where(deliveries.c.id == other_id).values(
            destination_ref='otro@example.org',
        ))
    seed(engine)  # segundo aviso permitido; solo debe enviar el primero

    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_MODE', 'true')
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_RECIPIENT', 'DESTINO@example.com')
    sent_to = []
    result = service.dispatch(engine, now=NOW, send_email=True,
                              mailer=lambda recipient, *_: sent_to.append(recipient))
    assert result['sent'] == 1
    assert sent_to == ['destino@example.com']
    rows = _all_deliveries(engine)
    assert sum(row['status'] == 'sent' for row in rows) == 1
    assert sum(row['attempts'] for row in rows) == 1
    assert next(row for row in rows if row['id'] == other_id)['status'] == 'pending'


def test_manual_mode_fails_closed_if_no_destination(engine, monkeypatch):
    seed(engine)
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_MODE', 'true')
    monkeypatch.delenv('OPERATIONAL_EMAIL_TEST_RECIPIENT', raising=False)
    with pytest.raises(ValueError, match='destinatario válido'):
        service.dispatch(engine, now=NOW, send_email=True,
                         mailer=lambda *_: pytest.fail('SMTP no autorizado'))
    assert all(row['attempts'] == 0 for row in _all_deliveries(engine))


def test_manual_mode_wrong_destination_never_claimed(engine, monkeypatch):
    seed(engine)
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_MODE', 'true')
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_RECIPIENT', 'distinto@example.com')
    result = service.dispatch(engine, now=NOW, send_email=True,
                              mailer=lambda *_: pytest.fail('SMTP no autorizado'))
    assert result['sent'] == 0
    assert all(row['attempts'] == 0 for row in _all_deliveries(engine))


def test_manual_mode_unapproved_never_sent(engine, monkeypatch):
    seed(engine, status='pending', reviewed=False)
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_MODE', 'true')
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_RECIPIENT', 'destino@example.com')
    result = service.dispatch(engine, now=NOW, send_email=True,
                              mailer=lambda *_: pytest.fail('Sin autorización'))
    assert result['sent'] == 0
    assert all(row['attempts'] == 0 for row in _all_deliveries(engine))


def test_without_send_email_never_uses_smtp_even_in_test_mode(engine, monkeypatch):
    seed(engine)
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_MODE', 'true')
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_RECIPIENT', 'destino@example.com')
    assert service.dispatch(engine, now=NOW, send_email=False,
                            mailer=lambda *_: pytest.fail('Sin --send-email'))['sent'] == 0
    assert all(row['attempts'] == 0 for row in _all_deliveries(engine))


def test_manual_mode_respects_unknown_outcome(engine, monkeypatch):
    seed(engine)
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_MODE', 'true')
    monkeypatch.setenv('OPERATIONAL_EMAIL_TEST_RECIPIENT', 'destino@example.com')
    monkeypatch.setattr(service, '_send_email', lambda *_: (_ for _ in ()).throw(
        RuntimeError('Red interrumpida después de enviar SMTP')))
    assert service.dispatch(engine, now=NOW, send_email=True)['uncertain'] == 1
    assert service.dispatch(engine, now=NOW + timedelta(hours=1), send_email=True)['sent'] == 0
    row = _all_deliveries(engine)[0]
    assert row['error_code'] == 'SMTP_OUTCOME_UNKNOWN' and row['next_attempt_at'] is None
