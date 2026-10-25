"""Suscripciones personales con consentimiento explícito, deduplicación y correo opcional.

Nunca genera mensajes sobre registros anteriores a la activación ni permite editar
la preferencia de otro usuario desde la API. Un fallo SMTP nunca imprime secretos.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from uuid import UUID

from sqlalchemy import and_, func, select, update, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.alerts.service import _send_email, _aware, NOTICE
from app.db.tables import (audit_logs, events, notification_preferences, personal_deliveries,
                           sources, users)

MAX_ATTEMPTS = 3
SOURCE_NAME = 'IGP/CENSIS'


def now_utc(now: datetime | None = None) -> datetime:
    return now or datetime.now(timezone.utc)


def _insert(engine):
    if engine.dialect.name == 'postgresql':
        return pg_insert(personal_deliveries)
    if engine.dialect.name == 'sqlite':
        return sqlite_insert(personal_deliveries)
    raise RuntimeError('Base de datos no soportada')


def _source_id(conn):
    source = conn.execute(select(sources.c.id).where(sources.c.name == SOURCE_NAME)).scalar_one_or_none()
    if source is None:
        raise ValueError('La fuente IGP/CENSIS no está registrada')
    return source


def _mailbox(email: str) -> bool:
    """Validación conservadora, no afirma confirmar la propiedad del buzón."""
    address = parseaddr(email)[1]
    if address != email or len(email) > 254 or '@' not in email:
        return False
    domain = email.rsplit('@', 1)[-1].lower()
    if domain in ('example.com', 'example.org', 'example.net', 'localhost'):
        return False
    return not domain.endswith(('.test', '.invalid', '.example')) and '.' in domain


def preference_for(engine, user_id: UUID) -> dict:
    with engine.connect() as conn:
        preference = conn.execute(select(notification_preferences).where(
            notification_preferences.c.user_id == user_id)).mappings().first()
        email = conn.execute(select(users.c.email).where(users.c.id == user_id)).scalar_one_or_none()
    if not email:
        raise ValueError('Usuario inexistente')
    return {'enabled': bool(preference['enabled']) if preference else False,
            'min_magnitude': float(preference['min_magnitude']) if preference else 3.5,
            'source': SOURCE_NAME, 'email': email,
            'email_usable': _mailbox(email),
            'activated_at': preference['activated_at'] if preference else None,
            'updated_at': preference['updated_at'] if preference else None}


def set_preference(engine, *, user_id: UUID, enabled: bool, min_magnitude: float,
                   now: datetime | None = None) -> dict:
    """Solo auto-servicio del usuario autenticado (ID proviene de JWT, no body).

    Toda modificación cancela entregas pendientes y reinicia la ventana; esto
    evita mandar correos de reglas previas cuando cambie el umbral.
    """
    now = now_utc(now)
    if not 2 <= min_magnitude <= 9 or round(min_magnitude, 1) != min_magnitude:
        raise ValueError('La magnitud debe estar entre 2.0 y 9.0, en décimas')
    with engine.begin() as conn:
        user = conn.execute(select(users.c.email, users.c.status).where(
            users.c.id == user_id)).first()
        if user is None or user.status != 'active':
            raise ValueError('Cuenta inactiva o inexistente')
        if enabled and not _mailbox(user.email):
            raise ValueError('Usa una cuenta con correo real para activar notificaciones')
        source_id = _source_id(conn)
        existing = conn.execute(select(notification_preferences).where(
            notification_preferences.c.user_id == user_id)).mappings().first()
        before = {'enabled': bool(existing['enabled']),
                  'min_magnitude': float(existing['min_magnitude'])} if existing else None
        # Modificaciones significativas reinician activación. Sin cambios = idempotente.
        changed = (existing is None or bool(existing['enabled']) != enabled or
                   float(existing['min_magnitude']) != min_magnitude or
                   existing['source_id'] != source_id)
        if changed:
            activated = now if enabled else None
            if existing is None:
                conn.execute(notification_preferences.insert().values(
                    user_id=user_id, source_id=source_id, enabled=enabled,
                    min_magnitude=min_magnitude, activated_at=activated, updated_at=now))
            else:
                conn.execute(update(notification_preferences).where(
                    notification_preferences.c.user_id == user_id).values(
                    source_id=source_id, enabled=enabled, min_magnitude=min_magnitude,
                    activated_at=activated, updated_at=now))
            # Nunca despachar lotes pendientes de una configuración anterior.
            conn.execute(update(personal_deliveries).where(
                personal_deliveries.c.user_id == user_id,
                personal_deliveries.c.status.in_(['pending', 'failed'])).values(status='cancelled'))
            conn.execute(audit_logs.insert().values(
                actor_id=user_id, action='notification.preference.updated',
                entity_type='notification_preferences', entity_id=user_id,
                before_json=before, after_json={'enabled': enabled, 'min_magnitude': min_magnitude,
                                                'source': SOURCE_NAME}, result='success'))
    return preference_for(engine, user_id)


def history_for(engine, *, user_id: UUID, page: int = 1, page_size: int = 10) -> dict:
    """Solo filas del usuario autenticado; el histórico no expone destinos SMTP."""
    relation = personal_deliveries.join(events, personal_deliveries.c.event_id == events.c.id)
    clause = personal_deliveries.c.user_id == user_id
    with engine.connect() as conn:
        total = conn.execute(select(func.count()).select_from(relation).where(clause)).scalar_one()
        rows = conn.execute(select(
            personal_deliveries.c.id, personal_deliveries.c.status,
            personal_deliveries.c.attempts, personal_deliveries.c.created_at,
            personal_deliveries.c.sent_at, personal_deliveries.c.error_code,
            events.c.magnitude, events.c.place, events.c.occurred_at,
            events.c.source_url,
        ).select_from(relation).where(clause)
            .order_by(personal_deliveries.c.created_at.desc(), personal_deliveries.c.id.desc())
            .limit(page_size).offset((page - 1) * page_size)).mappings().all()
    return {'items': [dict(item) for item in rows], 'total': total, 'page': page,
            'page_size': page_size, 'pages': max(1, (total + page_size - 1) // page_size)}


def evaluate(engine, *, now: datetime | None = None, limit: int = 1000) -> dict:
    """Poblar cola para usuarios opt-in, solo eventos recibidos tras la activación."""
    now = now_utc(now)
    viewed = queued = 0
    with engine.begin() as conn:
        if engine.dialect.name == 'postgresql':
            conn.execute(text('SELECT pg_advisory_xact_lock(20261024, 88)'))
        subscriptions = conn.execute(select(notification_preferences, users.c.status.label('user_status'))
            .select_from(notification_preferences.join(users, notification_preferences.c.user_id == users.c.id))
            .where(notification_preferences.c.enabled.is_(True),
                   notification_preferences.c.activated_at.is_not(None),
                   users.c.status == 'active')).mappings().all()
        for pref in subscriptions:
            candidates = conn.execute(select(events.c.id, events.c.magnitude).where(
                events.c.source_id == pref['source_id'],
                events.c.received_at >= pref['activated_at'],
                events.c.occurred_at >= now - timedelta(hours=24),
                events.c.occurred_at <= now + timedelta(minutes=5),
                events.c.magnitude >= float(pref['min_magnitude']),
            ).order_by(events.c.received_at, events.c.id).limit(limit)).all()
            for event in candidates:
                viewed += 1
                inserted = conn.execute(_insert(engine).values(
                    user_id=pref['user_id'], event_id=event.id,
                    status='pending', attempts=0, created_at=now,
                ).on_conflict_do_nothing(
                    index_elements=[personal_deliveries.c.user_id, personal_deliveries.c.event_id]
                ).returning(personal_deliveries.c.id)).scalar_one_or_none()
                if inserted:
                    queued += 1
    return {'inspected': viewed, 'queued': queued, 'notice': NOTICE}


def dispatch(engine, *, now: datetime | None = None, send_email: bool = False,
             mailer=None, limit: int = 100) -> dict:
    """Enviar únicamente colas opt-in activas; transiciones atómicas + 3 intentos.

    Si el proceso muere tras reclamar el trabajo, queda 'sending' para revisión
    manual: reintentar automáticamente un estado incierto podría duplicar correos.
    """
    if not send_email:
        return {'sent': 0, 'failed': 0, 'email_enabled': False}
    now = now_utc(now)
    mailer = mailer or _send_email
    sent = failed = 0
    with engine.connect() as conn:
        rows = conn.execute(select(personal_deliveries.c.id).where(
            personal_deliveries.c.status.in_(['pending', 'failed']),
            personal_deliveries.c.attempts < MAX_ATTEMPTS,
            (personal_deliveries.c.next_attempt_at.is_(None) |
             (personal_deliveries.c.next_attempt_at <= now)),
        ).order_by(personal_deliveries.c.created_at).limit(limit)).scalars().all()
    for delivery_id in rows:
        with engine.begin() as conn:
            if engine.dialect.name == 'postgresql':
                conn.execute(text('SELECT pg_advisory_xact_lock(20261024, 89)'))
            # Consultar configuración actual ANTES de reclamar correo.
            target = conn.execute(select(personal_deliveries.c.event_id, users.c.email,
                events.c.magnitude, events.c.place, events.c.occurred_at,
                events.c.source_url, users.c.status.label('user_status'),
                notification_preferences.c.enabled, notification_preferences.c.activated_at)
                .select_from(personal_deliveries
                    .join(users, personal_deliveries.c.user_id == users.c.id)
                    .join(events, personal_deliveries.c.event_id == events.c.id)
                    .join(notification_preferences,
                          personal_deliveries.c.user_id == notification_preferences.c.user_id))
                .where(personal_deliveries.c.id == delivery_id)).mappings().first()
            if not target:
                continue
            if not target['enabled'] or target['user_status'] != 'active' or not _mailbox(target['email']):
                conn.execute(update(personal_deliveries).where(personal_deliveries.c.id == delivery_id,
                    personal_deliveries.c.status.in_(['pending', 'failed'])).values(status='cancelled'))
                continue
            claimed = conn.execute(update(personal_deliveries).where(
                personal_deliveries.c.id == delivery_id,
                personal_deliveries.c.status.in_(['pending', 'failed']),
                personal_deliveries.c.attempts < MAX_ATTEMPTS,
            ).values(status='sending', last_attempt_at=now,
                     attempts=personal_deliveries.c.attempts + 1).returning(personal_deliveries.c.id)).scalar_one_or_none()
            if not claimed:
                continue
        # El servidor SMTP puede aceptar un mensaje sin garantizar entrega final.
        subject = f"[Sismo registrado IGP] M {float(target['magnitude']):.1f}"
        from zoneinfo import ZoneInfo
        local_time = _aware(target['occurred_at']).astimezone(ZoneInfo('America/Lima')).strftime('%d/%m/%Y %H:%M')
        body = (f"IGP/CENSIS reportó un sismo de magnitud {float(target['magnitude']):.1f}.\n"
                f"Ubicación: {target['place'] or 'No especificada'}\n"
                f"Fecha del evento (Perú): {local_time}\n"
                f"Fuente: {target['source_url']}\n\n{NOTICE}\n"
                'Puedes desactivar estos correos en Mi perfil > Mis notificaciones.')
        error_code = None
        try:
            mailer(target['email'], subject, body)
        except Exception:
            error_code = 'SMTP_SEND_FAILED'  # Nunca guardar excepción ni password SMTP.
        with engine.begin() as conn:
            attempt = conn.execute(select(personal_deliveries.c.attempts).where(
                personal_deliveries.c.id == delivery_id,
                personal_deliveries.c.status == 'sending')).scalar_one_or_none()
            if attempt is None:
                continue
            new_status = 'sent' if not error_code else 'failed'
            conn.execute(update(personal_deliveries).where(personal_deliveries.c.id == delivery_id).values(
                status=new_status, sent_at=now if not error_code else None,
                error_code=error_code,
                next_attempt_at=(now + timedelta(minutes=2 ** attempt)) if error_code and attempt < MAX_ATTEMPTS else None,
            ))
            conn.execute(audit_logs.insert().values(
                actor_id=None, action='notification.delivery.sent' if not error_code
                else 'notification.delivery.failed', entity_type='personal_notification_deliveries',
                entity_id=delivery_id, result='success' if not error_code else 'failed',
                after_json={'status': new_status, 'attempts': attempt},
            ))
        sent += error_code is None
        failed += error_code is not None
    return {'sent': sent, 'failed': failed, 'email_enabled': True}
