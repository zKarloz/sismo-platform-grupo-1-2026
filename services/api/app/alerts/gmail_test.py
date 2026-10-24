"""Prueba Gmail aislada. Contraseña de aplicación efímera: NUNCA persistir ni registrar.

El transporte está fijado a Gmail SMTP TLS/SSL y el destinatario es exclusivamente
el correo del administrador autenticado. No crea alertas sísmicas ni entregas.
"""
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import os
import re
import smtplib
import ssl
from uuid import UUID

from sqlalchemy import func, select, text

from app.db.tables import audit_logs

TEST_SUBJECT = '[PRUEBA] Sistema de Monitoreo Sísmico V2 — Gmail'


def smtp_server_status() -> dict:
    """Mostrar solo presencia de variables, nunca credenciales o destinatarios."""
    required = ('ALERT_SMTP_HOST', 'ALERT_SMTP_FROM', 'ALERT_SMTP_USER', 'ALERT_SMTP_PASSWORD')
    missing = [key for key in required if not os.environ.get(key, '').strip()]
    return {'configured': not missing, 'missing_variables': missing,
            'note': 'La configuración de envío operativo vive exclusivamente en el backend.'}


def reserve_test(engine, *, actor_id: UUID, now: datetime | None = None) -> None:
    """Máximo tres pruebas por usuario cada 15 min; guardar intento ANTES del SMTP.

    Un candado transaccional por actor evita concurrencia entre instancias PostgreSQL.
    El historial no contiene remitentes, contraseñas, destinos ni códigos secretos.
    """
    now = now or datetime.now(timezone.utc)
    with engine.begin() as conn:
        if engine.dialect.name == 'postgresql':
            conn.execute(text('SELECT pg_advisory_xact_lock(hashtext(:actor))'), {'actor': str(actor_id)})
        count = conn.execute(select(func.count()).select_from(audit_logs).where(
            audit_logs.c.actor_id == actor_id,
            audit_logs.c.action == 'alert.smtp.test.requested',
            audit_logs.c.occurred_at >= now - timedelta(minutes=15),
        )).scalar_one()
        if count >= 3:
            raise ValueError('Límite de tres pruebas cada 15 minutos. Vuelve a intentarlo más tarde.')
        conn.execute(audit_logs.insert().values(
            actor_id=actor_id, action='alert.smtp.test.requested', entity_type='users',
            entity_id=actor_id, result='success', occurred_at=now,
        ))


def record_test_success(engine, *, actor_id: UUID) -> None:
    """Auditar aceptación SMTP; no significa lectura ni entrega final."""
    with engine.begin() as conn:
        conn.execute(audit_logs.insert().values(
            actor_id=actor_id, action='alert.smtp.test.accepted', entity_type='users',
            entity_id=actor_id, result='success', occurred_at=datetime.now(timezone.utc),
        ))


def send_gmail_test(*, gmail: str, app_password: str, destination: str) -> None:
    """Envía UNA prueba al propio administrador usando Gmail SSL:465, sin almacenar secret.

    No aceptar host ni puerto desde React para evitar SSRF / relay SMTP abierto.
    """
    if not re.fullmatch(r'[A-Za-z0-9._%+\-]+@(?:gmail\.com|googlemail\.com)', gmail, re.I):
        raise ValueError('La cuenta remitente debe ser una dirección Gmail válida')
    if (len(app_password.replace(' ', '')) != 16
            or not re.fullmatch(r'[A-Za-z0-9 ]+', app_password)):
        raise ValueError('Introduce la contraseña de aplicación de 16 caracteres generada en Google')
    if not re.fullmatch(r'[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+', destination):
        raise ValueError('Destinatario no válido')

    message = EmailMessage()
    message['Subject'] = TEST_SUBJECT
    message['From'] = gmail
    message['To'] = destination
    message.set_content(
        'PRUEBA TÉCNICA DEL CANAL GMAIL — Sistema de Monitoreo Sísmico V2.\n\n'
        'Este mensaje NO corresponde a un evento sísmico, NO es una alerta operativa '
        'y NO constituye una alerta temprana ni un comunicado oficial.\n'
    )
    # No devolver ni registrar excepciones sin sanitizar: algunos clientes SMTP
    # incluyen credenciales, nombres o contenido de mensaje en sus errores.
    with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=ssl.create_default_context(), timeout=15) as smtp:
        smtp.login(gmail, app_password.replace(' ', ''))
        smtp.send_message(message)
