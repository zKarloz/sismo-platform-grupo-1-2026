"""Motor de avisos informativos: reglas sobre eventos OBSERVADOS, sin predicción.

Escrituras exclusivamente desde comandos privados con credenciales PostgreSQL.
La API pública expone solo lectura y nunca envía correos ni aprueba alertas.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from email.message import EmailMessage
import os
import re
import smtplib
from zoneinfo import ZoneInfo
from uuid import UUID

from sqlalchemy import and_, func, or_, select, update, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.db.tables import (
    alert_rules, alerts, audit_logs, deliveries, events, sources, users,
)

LIMA = ZoneInfo('America/Lima')
NOTICE = 'Aviso informativo sobre un sismo registrado. No es una alerta oficial ni temprana.'
TOKENS = {'magnitude', 'place', 'occurred_at', 'depth_km', 'source_url', 'source_name'}
MAX_ATTEMPTS = 3


def _now(value: datetime | None = None) -> datetime:
    return value or datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    """SQLite de pruebas no conserva tzinfo; nuestros datos de prueba son UTC."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _insert(engine, table):
    if engine.dialect.name == 'postgresql':
        return pg_insert(table)
    if engine.dialect.name == 'sqlite':
        return sqlite_insert(table)
    raise RuntimeError('Motor de base de datos no admitido')


def _audit(conn, *, action: str, table: str, entity_id: UUID | None,
           actor_id: UUID | None = None, before=None, after=None):
    """No registrar emails, contraseñas, tokens ni destinos de notificación."""
    conn.execute(audit_logs.insert().values(
        actor_id=actor_id, action=action, entity_type=table, entity_id=entity_id,
        before_json=before, after_json=after, result='success',
    ))


def _actor(conn, email: str, roles: tuple[str, ...] = ('administrador', 'operador_alertas')) -> UUID:
    """Chequeo de rol, NO autenticación: el CLI requiere credenciales privadas de BD."""
    actor = conn.execute(select(users).where(func.lower(users.c.email) == email.lower())).mappings().first()
    if not actor or actor['status'] != 'active' or actor['role'] not in roles:
        raise ValueError('Operador inexistente, inactivo o sin rol suficiente')
    return actor['id']


def bootstrap_user(engine, *, email: str, name: str) -> UUID:
    """Solo ejecución local por propietario de DATABASE_URL, sin ruta pública."""
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise ValueError('Email inválido')
    if not name.strip():
        raise ValueError('Nombre obligatorio')
    with engine.begin() as conn:
        # La migración usa índice UNIQUE lower(email), por lo que primero
        # comprobamos insensiblemente a mayúsculas para evitar conflictos.
        existing = conn.execute(select(users.c.id).where(func.lower(users.c.email) == email.lower())).scalar_one_or_none()
        if existing:
            return existing
        # En postgres hay un índice único funcional; no señalar index_elements(email).
        return conn.execute(users.insert().values(
            email=email.lower(), full_name=name.strip(), role='administrador', status='active',
        ).returning(users.c.id)).scalar_one()


def validate_template(template: str) -> None:
    """Solo sustitución explícita de claves simples, sin acceso a objetos Python."""
    if not template or len(template) > 1000:
        raise ValueError('Plantilla vacía o demasiado larga')
    fields = re.findall(r'\{([^{}]+)\}', template)
    if any(key not in TOKENS for key in fields):
        raise ValueError('Plantilla con marcador no permitido')
    if template.count('{') != template.count('}') or len(fields) != template.count('{'):
        raise ValueError('Plantilla con llaves inválidas')


def validate_zone(zone: dict) -> None:
    """Zona delimitada (bbox); no confundir cuadrícula con frontera oficial."""
    if set(zone) != {'min_lat', 'max_lat', 'min_lon', 'max_lon'}:
        raise ValueError('La zona necesita min_lat, max_lat, min_lon, max_lon')
    try:
        a, b, c, d = [float(zone[k]) for k in ('min_lat','max_lat','min_lon','max_lon')]
    except (TypeError, ValueError) as exc:
        raise ValueError('Coordenadas no numéricas') from exc
    if not (-90 <= a < b <= 90 and -180 <= c < d <= 180):
        raise ValueError('Rectángulo geográfico inválido')


def create_rule(engine, *, actor_email: str, name: str, min_magnitude: float,
                zone: dict, source: str = 'IGP/CENSIS', channel: str = 'in_app',
                severity: str = 'info', max_depth_km: float | None = None,
                cooldown_seconds: int = 1800, requires_approval: bool = True,
                destination: str | None = None, start_hour_peru: int | None = None,
                end_hour_peru: int | None = None,
                title: str = 'Sismo registrado: M {magnitude}',
                body: str = 'Sismo de M {magnitude}, {place}, a {depth_km} km, reportado por {source_name} el {occurred_at}. {source_url}') -> UUID:
    if not name.strip() or not (0 <= min_magnitude <= 10):
        raise ValueError('Nombre y umbral de magnitud requeridos')
    if channel not in ('in_app', 'email') or severity not in ('info', 'review', 'high'):
        raise ValueError('Canal o severidad no admitidos')
    if channel == 'email' and (not destination or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', destination)):
        raise ValueError('El canal email requiere destinatario válido')
    if (channel == 'email' or severity in ('review', 'high')) and not requires_approval:
        raise ValueError('Correo y prioridades de revisión/alta requieren aprobación humana')
    if (start_hour_peru is None) != (end_hour_peru is None):
        raise ValueError('Indica las dos horas o ninguna')
    if start_hour_peru is not None and not (0 <= start_hour_peru < end_hour_peru <= 24):
        raise ValueError('Horario inválido (America/Lima)')
    if max_depth_km is not None and not (0 <= max_depth_km <= 1000):
        raise ValueError('Profundidad inválida')
    if not (0 <= cooldown_seconds <= 86400):
        raise ValueError('Cooldown inválido')
    validate_zone(zone)
    validate_template(title)
    validate_template(body)
    with engine.begin() as conn:
        actor_id = _actor(conn, actor_email, ('administrador',))
        source_id = conn.execute(select(sources.c.id).where(sources.c.name == source)).scalar_one_or_none()
        if source_id is None:
            raise ValueError('La fuente no está registrada; sincronízala primero')
        rule_id = conn.execute(alert_rules.insert().values(
            name=name.strip(), min_magnitude=min_magnitude, max_depth_km=max_depth_km,
            zone_spec=zone, severity=severity, channel=channel,
            cooldown_seconds=cooldown_seconds, enabled=False,
            requires_approval=requires_approval, created_by=actor_id,
            source_id=source_id, destination_ref=destination if channel == 'email' else 'centro-interno',
            template_title=title, template_body=body,
            start_hour_peru=start_hour_peru, end_hour_peru=end_hour_peru,
        ).returning(alert_rules.c.id)).scalar_one()
        _audit(conn, action='alert.rule.created', table='alert_rules', entity_id=rule_id,
               actor_id=actor_id, after={'enabled': False, 'source': source, 'channel': channel})
        return rule_id


def activate_rule(engine, *, rule_id: UUID, actor_email: str, enabled: bool,
                  now: datetime | None = None) -> None:
    with engine.begin() as conn:
        actor_id = _actor(conn, actor_email, ('administrador',))
        previous = conn.execute(select(alert_rules.c.enabled).where(alert_rules.c.id == rule_id)).scalar_one_or_none()
        if previous is None:
            raise ValueError('Regla inexistente')
        conn.execute(update(alert_rules).where(alert_rules.c.id == rule_id).values(
            enabled=enabled, activated_at=_now(now) if enabled else None,
            updated_at=_now(now),
        ))
        _audit(conn, action='alert.rule.activated' if enabled else 'alert.rule.disabled',
               table='alert_rules', entity_id=rule_id, actor_id=actor_id,
               before={'enabled': bool(previous)}, after={'enabled': enabled})


def match_event(rule: dict, event: dict, *, now: datetime | None = None,
                require_recent: bool = True) -> tuple[bool, str]:
    """Regla observacional: nunca examina salidas de ML ni calcula riesgo."""
    now = _now(now)
    occurred = _aware(event['occurred_at'])
    if event['source_id'] != rule['source_id']:
        return False, 'Fuente no permitida'
    if event['magnitude'] is None or float(event['magnitude']) < float(rule['min_magnitude']):
        return False, 'Magnitud inferior al umbral o ausente'
    if rule['max_depth_km'] is not None and (event['depth_km'] is None or float(event['depth_km']) > float(rule['max_depth_km'])):
        return False, 'Profundidad fuera del umbral'
    z = rule['zone_spec']
    try:
        validate_zone(z)
        if not (float(z['min_lat']) <= float(event['latitude']) <= float(z['max_lat'])
                and float(z['min_lon']) <= float(event['longitude']) <= float(z['max_lon'])):
            return False, 'Fuera de zona'
    except ValueError:
        return False, 'Zona inválida'
    local_hour = occurred.astimezone(LIMA).hour
    if rule['start_hour_peru'] is not None and not (rule['start_hour_peru'] <= local_hour < rule['end_hour_peru']):
        return False, 'Fuera de horario Perú'
    if require_recent:
        if not rule['enabled'] or not rule['activated_at']:
            return False, 'Regla inactiva'
        if _aware(event['received_at']) < _aware(rule['activated_at']):
            return False, 'Evento recibido antes de activar la regla'
        if occurred > now + timedelta(minutes=5) or occurred < now - timedelta(hours=24):
            return False, 'Evento antiguo o con fecha futura'
    return True, 'Coincide'


def _render(rule: dict, ev: dict, source_name: str) -> tuple[str, str]:
    fields = {
        'magnitude': f"{float(ev['magnitude']):.1f}", 'place': ev['place'] or 'ubicación no especificada',
        'occurred_at': _aware(ev['occurred_at']).astimezone(LIMA).strftime('%d/%m/%Y %H:%M Perú'),
        'depth_km': f"{float(ev['depth_km']):.1f}" if ev['depth_km'] is not None else 'no reportada',
        'source_url': ev['source_url'], 'source_name': source_name,
    }
    title, body = rule['template_title'].format_map(fields), rule['template_body'].format_map(fields)
    return title[:200], f'{body[:1500]}\n{NOTICE}'


def simulate(engine, *, rule_id: UUID, event_id: UUID) -> dict:
    """Sin escrituras ni comunicaciones: permite probar reglas contra eventos."""
    with engine.connect() as conn:
        rule = conn.execute(select(alert_rules).where(alert_rules.c.id == rule_id)).mappings().first()
        event = conn.execute(select(events).where(events.c.id == event_id)).mappings().first()
        if not rule or not event:
            raise ValueError('Regla o evento no encontrado')
        ok, reason = match_event(dict(rule), dict(event), require_recent=False)
        return {'match': ok, 'reason': reason,
                'simulation': True, 'disclaimer': NOTICE}


def evaluate(engine, *, now: datetime | None = None, max_events: int = 1000) -> dict:
    """Evaluación incremental e idempotente. No hace delivery ni envía email."""
    now = _now(now)
    generated = 0
    inspected = 0
    with engine.begin() as conn:
        if engine.dialect.name == 'postgresql':
            # Bloqueo global contra cron+operador simultáneos; evita duplicados y cooldown races.
            conn.execute(text('SELECT pg_advisory_xact_lock(20261023, 77)'))
        rules = [dict(r) for r in conn.execute(select(alert_rules).where(
            alert_rules.c.enabled.is_(True), alert_rules.c.activated_at.is_not(None),
            alert_rules.c.source_id.is_not(None),
        )).mappings()]
        for rule in rules:
            recent = conn.execute(select(events).where(and_(
                events.c.source_id == rule['source_id'],
                events.c.received_at >= rule['activated_at'],
                events.c.occurred_at >= now - timedelta(hours=24),
                events.c.occurred_at <= now + timedelta(minutes=5),
            )).order_by(events.c.received_at.asc(), events.c.id.asc()).limit(max_events)).mappings()
            source_name = conn.execute(select(sources.c.name).where(sources.c.id == rule['source_id'])).scalar_one()
            for record in recent:
                ev = dict(record)
                inspected += 1
                matched, _ = match_event(rule, ev, now=now)
                if not matched:
                    continue
                if conn.execute(select(alerts.c.id).where(and_(
                    alerts.c.event_id == ev['id'], alerts.c.rule_id == rule['id'],
                ))).first():
                    continue
                if rule['cooldown_seconds'] > 0:
                    last = conn.execute(select(alerts.c.created_at).where(
                        alerts.c.rule_id == rule['id'],
                        alerts.c.created_at > now - timedelta(seconds=rule['cooldown_seconds']),
                    ).order_by(alerts.c.created_at.desc()).limit(1)).scalar_one_or_none()
                    if last:
                        continue
                title, body = _render(rule, ev, source_name)
                alert_id = conn.execute(_insert(engine, alerts).values(
                    event_id=ev['id'], rule_id=rule['id'], severity=rule['severity'],
                    title=title, message=body, source_url=ev['source_url'],
                    status='pending' if rule['requires_approval'] else 'approved',
                    disclaimer=NOTICE,
                    created_at=now,
                ).on_conflict_do_nothing(index_elements=[alerts.c.event_id, alerts.c.rule_id])
                    .returning(alerts.c.id)).scalar_one_or_none()
                if not alert_id:
                    continue
                conn.execute(deliveries.insert().values(
                    alert_id=alert_id, channel=rule['channel'],
                    destination_ref=rule['destination_ref'] or 'centro-interno',
                    status='pending', attempts=0,
                ))
                _audit(conn, action='alert.generated', table='alerts', entity_id=alert_id,
                       after={'severity': rule['severity'], 'requires_approval': rule['requires_approval']})
                generated += 1
    return {'inspected': inspected, 'generated': generated, 'disclaimer': NOTICE}


def review(engine, *, alert_id: UUID, actor_email: str, approve: bool,
           now: datetime | None = None) -> None:
    now = _now(now)
    with engine.begin() as conn:
        actor_id = _actor(conn, actor_email)
        current = conn.execute(select(alerts.c.status).where(alerts.c.id == alert_id)).scalar_one_or_none()
        if current != 'pending':
            raise ValueError('Solo se pueden revisar alertas pendientes')
        new_status = 'approved' if approve else 'cancelled'
        conn.execute(update(alerts).where(alerts.c.id == alert_id).values(
            status=new_status, approved_by=actor_id if approve else None,
            approved_at=now if approve else None,
        ))
        if not approve:
            conn.execute(update(deliveries).where(deliveries.c.alert_id == alert_id).values(status='cancelled'))
        _audit(conn, action='alert.approved' if approve else 'alert.cancelled',
               table='alerts', entity_id=alert_id, actor_id=actor_id,
               before={'status': current}, after={'status': new_status})


def _send_email(destination: str, subject: str, body: str) -> None:
    """SMTP opcional; secretos solo mediante variables privadas del operador."""
    host, sender = os.getenv('ALERT_SMTP_HOST'), os.getenv('ALERT_SMTP_FROM')
    if not host or not sender:
        raise RuntimeError('SMTP_NOT_CONFIGURED')
    msg = EmailMessage()
    msg['From'], msg['To'], msg['Subject'] = sender, destination, subject
    msg.set_content(body)
    port = int(os.getenv('ALERT_SMTP_PORT', '465'))
    with smtplib.SMTP_SSL(host, port, timeout=10) as client:
        username = os.getenv('ALERT_SMTP_USER')
        if username:
            client.login(username, os.environ['ALERT_SMTP_PASSWORD'])
        client.send_message(msg)


def dispatch(engine, *, now: datetime | None = None, send_email: bool = False,
             mailer=None) -> dict:
    """Canal in_app publica en el centro; email solo con --send-email explícito.

    Los reintentos (máximo 3) utilizan backoff y no exponen detalles SMTP.
    """
    now = _now(now)
    delivered = failed = 0
    mailer = mailer or _send_email
    with engine.connect() as conn:
        items = conn.execute(select(deliveries, alerts.c.title, alerts.c.message, alerts.c.status.label('alert_status'))
            .select_from(deliveries.join(alerts, deliveries.c.alert_id == alerts.c.id))
            .where(deliveries.c.status.in_(['pending', 'failed']), alerts.c.status.in_(['approved', 'failed']),
                   deliveries.c.attempts < MAX_ATTEMPTS)
            .order_by(deliveries.c.created_at.asc()).limit(200)).mappings().all()
    for item in items:
        d = dict(item)
        if d['next_attempt_at'] and _aware(d['next_attempt_at']) > now:
            continue
        if d['channel'] == 'email' and not send_email:
            continue
        error = None
        try:
            if d['channel'] == 'email':
                mailer(d['destination_ref'], d['title'], d['message'])
            elif d['channel'] != 'in_app':
                raise RuntimeError('UNKNOWN_CHANNEL')
        except Exception:
            # No persistir credenciales, excepciones SMTP ni direcciones privadas.
            error = 'SMTP_SEND_FAILED' if d['channel'] == 'email' else 'DELIVERY_FAILED'
        with engine.begin() as conn:
            if engine.dialect.name == 'postgresql':
                conn.execute(text('SELECT pg_advisory_xact_lock(20261023, 78)'))
            current = conn.execute(select(deliveries.c.status, deliveries.c.attempts)
                .where(deliveries.c.id == d['id'])).first()
            if not current or current.status not in ('pending', 'failed') or current.attempts >= MAX_ATTEMPTS:
                continue
            attempts = current.attempts + 1
            if error:
                conn.execute(update(deliveries).where(deliveries.c.id == d['id']).values(
                    status='failed', attempts=attempts, last_attempt_at=now,
                    next_attempt_at=now + timedelta(seconds=60 * (2 ** (attempts - 1))) if attempts < MAX_ATTEMPTS else None,
                    error_code=error,
                ))
                conn.execute(update(alerts).where(alerts.c.id == d['alert_id']).values(status='failed'))
                failed += 1
            else:
                conn.execute(update(deliveries).where(deliveries.c.id == d['id']).values(
                    status='sent', attempts=attempts, last_attempt_at=now,
                    next_attempt_at=None, delivered_at=now, error_code=None,
                ))
                conn.execute(update(alerts).where(alerts.c.id == d['alert_id']).values(status='sent'))
                delivered += 1
            _audit(conn, action='alert.delivery.failed' if error else 'alert.delivery.sent',
                   table='alert_deliveries', entity_id=d['id'],
                   after={'channel': d['channel'], 'attempts': attempts, 'status': 'failed' if error else 'sent'})
    return {'sent': delivered, 'failed': failed, 'email_enabled': send_email}


def acknowledge(engine, *, delivery_id: UUID, actor_email: str, now: datetime | None = None) -> None:
    """Acuse MANUAL de un operador: no confirma recepción por un usuario final."""
    with engine.begin() as conn:
        actor_id = _actor(conn, actor_email)
        current = conn.execute(select(deliveries.c.status).where(deliveries.c.id == delivery_id)).scalar_one_or_none()
        if current != 'sent':
            raise ValueError('Solo se puede acusar una entrega publicada')
        conn.execute(update(deliveries).where(deliveries.c.id == delivery_id).values(acknowledged_at=_now(now)))
        _audit(conn, action='alert.delivery.acknowledged', table='alert_deliveries',
               entity_id=delivery_id, actor_id=actor_id)
