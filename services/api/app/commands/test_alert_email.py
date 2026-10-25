"""Prueba SMTP explícita sin crear eventos, alertas ni entregas ficticias.

Uso desde una terminal privada:
    python -m app.commands.test_alert_email --to usuario@correo.com
    python -m app.commands.test_alert_email --to usuario@correo.com --send

El primer comando solo revisa la configuración; --send envía UN correo
marcado claramente como PRUEBA. No consulta ni modifica Supabase.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
import re
from zoneinfo import ZoneInfo

from app.alerts.service import _send_email

LIMA = ZoneInfo('America/Lima')
SUBJECT = '[PRUEBA] Sistema de Monitoreo Sísmico V2 — Canal de correo'


def _validate_address(address: str) -> None:
    """Acepta un solo destinatario y bloquea saltos de línea/cabeceras inyectadas."""
    if (not re.fullmatch(r'[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+', address)
            or len(address) > 254):
        raise ValueError('Destinatario inválido: indica un único correo electrónico')


def _validate_smtp() -> list[str]:
    """Devuelve variables faltantes sin imprimir sus valores ni secretos."""
    required = ('ALERT_SMTP_HOST', 'ALERT_SMTP_FROM', 'ALERT_SMTP_USER', 'ALERT_SMTP_PASSWORD')
    missing = [key for key in required if not os.environ.get(key, '').strip()]
    port = os.environ.get('ALERT_SMTP_PORT', '465')
    try:
        parsed = int(port)
        if parsed < 1 or parsed > 65535:
            raise ValueError
    except ValueError as exc:
        raise ValueError('ALERT_SMTP_PORT debe ser un puerto TCP válido') from exc
    return missing


def run(destination: str, *, send: bool = False) -> dict:
    """Genera un mensaje de prueba sin asociarlo a ningún sismo ni cambiar BD."""
    _validate_address(destination)
    missing = _validate_smtp()
    if not send:
        return {
            'mode': 'preflight',
            'sent': False,
            'smtp_configured': not missing,
            'missing_variables': missing,
            'note': 'No se envió correo. Para enviarlo agrega --send.',
        }
    if missing:
        raise ValueError('Configuración SMTP incompleta: ' + ', '.join(missing))
    body = (
        'PRUEBA DE CANAL DE CORREO — SISTEMA DE MONITOREO SÍSMICO V2\n\n'
        'Este es un mensaje de comprobación técnica del canal SMTP.\n'
        'NO corresponde a un sismo real, NO representa una alerta operativa\n'
        'y NO es un aviso oficial ni una alerta temprana.\n\n'
        f'Fecha de prueba (Perú): {datetime.now(LIMA):%d/%m/%Y %H:%M:%S}\n'
    )
    # Reutilizar el transporte SMTP SSL (puerto 465) ya implementado en Fase 7.
    _send_email(destination, SUBJECT, body)
    return {
        'mode': 'test_email',
        'sent': True,
        'note': 'Servidor SMTP aceptó el mensaje; revisa la bandeja y el spam.',
        'database_modified': False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Probar SMTP sin crear alertas sísmicas')
    parser.add_argument('--to', required=True, help='Un correo de prueba, nunca un listado')
    parser.add_argument('--send', action='store_true', help='Enviar realmente un correo marcado PRUEBA')
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.to, send=args.send), ensure_ascii=False, indent=2))
    except ValueError as exc:
        parser.exit(2, f'ERROR: {exc}\n')
    except Exception:
        # No imprimir excepción SMTP: puede contener direcciones, tokens o URLs.
        parser.exit(1, 'ERROR: Falló el envío SMTP. Revisa host, puerto 465, contraseña de aplicación y red.\n')


if __name__ == '__main__':
    main()
