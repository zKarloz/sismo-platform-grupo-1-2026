"""Pruebas aisladas del correo de verificación; NUNCA conectan a SMTP real."""
import pytest
from app.commands import test_alert_email as mod


def test_preflight_no_real_delivery(monkeypatch):
    def no_send(*_args):
        pytest.fail('La previsualización no debe enviar correo')
    monkeypatch.setattr(mod, '_send_email', no_send)
    result = mod.run('destinatario@example.org')
    assert result['mode'] == 'preflight'
    assert result['sent'] is False


def test_one_explicit_test_email(monkeypatch):
    # Configuración solo en memoria; SMTP será reemplazado por un doble.
    for name, val in {
        'ALERT_SMTP_HOST': 'smtp.example.org',
        'ALERT_SMTP_FROM': 'remitente@example.org',
        'ALERT_SMTP_USER': 'remitente@example.org',
        'ALERT_SMTP_PASSWORD': 'solo-para-test',
        'ALERT_SMTP_PORT': '465',
    }.items():
        monkeypatch.setenv(name, val)
    sent = []
    monkeypatch.setattr(mod, '_send_email', lambda *args: sent.append(args))
    result = mod.run('destinatario@example.org', send=True)
    assert result['sent'] is True and result['database_modified'] is False
    assert len(sent) == 1
    assert 'PRUEBA' in sent[0][1] and 'NO corresponde a un sismo real' in sent[0][2]
    assert sent[0][0] == 'destinatario@example.org'


@pytest.mark.parametrize('address', [
    'usuario@', 'uno@example.org,dos@example.org',
    'usuario@example.org\nBcc:otra@example.org', ' ',
])
def test_blocks_invalid_or_multiple_recipients(address):
    with pytest.raises(ValueError, match='Destinatario inválido'):
        mod.run(address, send=True)


def test_missing_smtp_vars_prevent_delivery(monkeypatch):
    for name in ('ALERT_SMTP_HOST', 'ALERT_SMTP_FROM', 'ALERT_SMTP_USER', 'ALERT_SMTP_PASSWORD'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(mod, '_send_email', lambda *_: pytest.fail('No enviar sin SMTP'))
    with pytest.raises(ValueError, match='Configuración SMTP incompleta'):
        mod.run('destinatario@example.org', send=True)


def test_invalid_port_rejected(monkeypatch):
    monkeypatch.setenv('ALERT_SMTP_PORT', 'invalid')
    with pytest.raises(ValueError, match='ALERT_SMTP_PORT'):
        mod.run('destinatario@example.org')
