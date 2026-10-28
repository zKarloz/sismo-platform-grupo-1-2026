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
EMAIL_EXPIRED = 'EVENT_TOO_OLD'  # Solo para el historial; no se reintenta.


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
    """Revisión por transición atómica: dos operadores no pueden aprobar/cancelar a la vez."""
    now = _now(now)
    with engine.begin() as conn:
        actor_id = _actor(conn, actor_email)
        new_status = 'approved' if approve else 'cancelled'
        # El estado pendiente es parte del UPDATE, no una comprobación previa vulnerable.
        changed = conn.execute(update(alerts).where(
            alerts.c.id == alert_id, alerts.c.status == 'pending',
        ).values(
            status=new_status, approved_by=actor_id if approve else None,
            approved_at=now if approve else None,
        ).returning(alerts.c.id)).scalar_one_or_none()
        if changed is None:
            raise ValueError('Solo se pueden revisar alertas pendientes')
        if not approve:
            conn.execute(update(deliveries).where(
                deliveries.c.alert_id == alert_id, deliveries.c.status == 'pending',
            ).values(status='cancelled', next_attempt_at=None))
        _audit(conn, action='alert.approved' if approve else 'alert.cancelled',
               table='alerts', entity_id=alert_id, actor_id=actor_id,
               before={'status': 'pending'}, after={'status': new_status})


class SMTPBeforeSubmissionError(RuntimeError):
    """Error comprobado ANTES de pasar el mensaje al servidor SMTP; permite reintento."""


# Usamos las columnas existentes: no se añaden estados fuera del CHECK de Supabase.
# Una reserva de correo queda status=failed + error_code=SMTP_OUTCOME_UNKNOWN,
# next_attempt_at=NULL. Si muere el proceso, NO se reintenta automáticamente:
# el servidor SMTP puede haber aceptado el mensaje antes de perder la conexión.
SMTP_OUTCOME_UNKNOWN = 'SMTP_OUTCOME_UNKNOWN'
SMTP_SEND_FAILED = 'SMTP_SEND_FAILED'


def _send_email(destination: str, subject: str, body: str) -> None:
    """Transporte SMTP: diferencia fallos previos de resultados ambiguos.

    Si send_message lanza una excepción, pudo haber sido aceptado por SMTP:
    NO se asume que sea seguro reenviar el mismo mensaje automáticamente.
    """
    host = os.getenv('ALERT_SMTP_HOST')
    sender = os.getenv('ALERT_SMTP_FROM')
    user = os.getenv('ALERT_SMTP_USER')
    password = os.getenv('ALERT_SMTP_PASSWORD')
    if not host or not sender or (user and not password):
        raise SMTPBeforeSubmissionError('SMTP_NOT_CONFIGURED')
    try:
        msg = EmailMessage()
        msg['From'], msg['To'], msg['Subject'] = sender, destination, subject
        msg.set_content(body)
        port = int(os.getenv('ALERT_SMTP_PORT', '465'))
        client = smtplib.SMTP_SSL(host, port, timeout=10)
    except Exception as exc:
        # El cliente aún no entregó ningún mensaje al servidor.
        raise SMTPBeforeSubmissionError('SMTP_CONNECTION_FAILED') from exc
    try:
        try:
            if user:
                client.login(user, password)
        except Exception as exc:
            raise SMTPBeforeSubmissionError('SMTP_AUTH_FAILED') from exc
        # Desde este punto no podemos probar que una excepción signifique
        # no aceptación del mensaje: resultado incierto, revisión manual.
        client.send_message(msg)
    finally:
        # Fallar al cerrar SMTP después de un 250 no debe reenviar el correo.
        try:
            client.quit()
        except Exception:
            pass


def _operational_email_max_age() -> timedelta:
    """Ventana segura de frescura (1 a 24 horas), con 6 h predeterminadas.

    La configuración inválida bloquea el correo en lugar de enviar un backlog.
    """
    value = os.getenv('OPERATIONAL_EMAIL_MAX_AGE_HOURS', '6').strip()
    if not re.fullmatch(r'[0-9]{1,2}', value) or not 1 <= int(value) <= 24:
        raise ValueError('OPERATIONAL_EMAIL_MAX_AGE_HOURS debe estar entre 1 y 24')
    return timedelta(hours=int(value))


def _recent_email_event(now: datetime, age: timedelta):
    """Usa el instante del sismo, NO la aprobación ni la fecha de ingesta."""
    return select(alerts.c.id).select_from(
        alerts.join(events, alerts.c.event_id == events.c.id)
    ).where(
        alerts.c.id == deliveries.c.alert_id,
        events.c.occurred_at >= now - age,
        events.c.occurred_at <= now + timedelta(minutes=5),
    ).exists()


def _expire_old_email_deliveries(engine, now: datetime, age: timedelta,
                                 destination_guard=None) -> int:
    """Cancelar entregas atrasadas sin SMTP, conservando el historial.

    Solo se cancelan pendientes/reintentos seguros de avisos IGP aprobados.
    Una entrega ya enviada o un resultado SMTP ambiguo nunca se modifica.
    """
    stale = select(alerts.c.id).select_from(
        alerts.join(events, alerts.c.event_id == events.c.id)
              .join(sources, events.c.source_id == sources.c.id)
    ).where(
        alerts.c.id == deliveries.c.alert_id,
        alerts.c.status.in_(['approved', 'failed']),
        sources.c.name == 'IGP/CENSIS',
        events.c.occurred_at < now - age,
    ).exists()
    mutable = or_(
        deliveries.c.status == 'pending',
        and_(deliveries.c.status == 'failed',
             deliveries.c.error_code == SMTP_SEND_FAILED,
             deliveries.c.next_attempt_at.is_not(None)),
    )
    conditions = [deliveries.c.channel == 'email', mutable, stale]
    if destination_guard is not None:
        conditions.append(destination_guard)
    with engine.begin() as conn:
        ids = conn.execute(select(deliveries.c.id).where(*conditions)
                           .order_by(deliveries.c.created_at.asc(), deliveries.c.id.asc())
                           .limit(200)).scalars().all()
        expired = 0
        for delivery_id in ids:
            # La condición mutable se reevalúa en el UPDATE por concurrencia.
            result = conn.execute(update(deliveries).where(
                deliveries.c.id == delivery_id, *conditions,
            ).values(status='cancelled', next_attempt_at=None,
                     error_code=EMAIL_EXPIRED).returning(deliveries.c.id)).scalar_one_or_none()
            if result is None:
                continue
            _audit(conn, action='alert.delivery.expired', table='alert_deliveries',
                   entity_id=delivery_id, after={'channel': 'email', 'reason': EMAIL_EXPIRED})
            expired += 1
        return expired


def _eligible_delivery(now: datetime, *, email_age: timedelta | None = None):
    """Elegibilidad reutilizada en SELECT y reserva CAS, siempre bajo las reglas IGP."""
    # failed solo es reintentable si el fallo ocurrió antes de la entrega SMTP
    # y se programó explícitamente un próximo intento.
    retry_due = and_(
        deliveries.c.status == 'failed',
        deliveries.c.error_code == SMTP_SEND_FAILED,
        deliveries.c.next_attempt_at.is_not(None),
        deliveries.c.next_attempt_at <= now,
    )
    pending_due = and_(
        deliveries.c.status == 'pending',
        or_(deliveries.c.next_attempt_at.is_(None), deliveries.c.next_attempt_at <= now),
    )
    valid_alert = select(alerts.c.id).select_from(
        alerts.join(alert_rules, alerts.c.rule_id == alert_rules.c.id)
              .join(events, alerts.c.event_id == events.c.id)
              .join(sources, events.c.source_id == sources.c.id)
    ).where(
        alerts.c.id == deliveries.c.alert_id,
        alerts.c.status.in_(['approved', 'failed']),
        alert_rules.c.enabled.is_(True),
        alert_rules.c.channel == deliveries.c.channel,
        sources.c.name == 'IGP/CENSIS',
        alert_rules.c.source_id == events.c.source_id,
        # El canal email exige revisión humana incluso para datos antiguos.
        or_(deliveries.c.channel == 'in_app', and_(
            alert_rules.c.requires_approval.is_(True),
            alerts.c.approved_by.is_not(None), alerts.c.approved_at.is_not(None),
        )),
    ).exists()
    # La edad limita solo el correo; los avisos internos no caducan.
    freshness = (or_(deliveries.c.channel != 'email', _recent_email_event(now, email_age))
                 if email_age is not None else True)
    return and_(deliveries.c.attempts < MAX_ATTEMPTS,
                or_(pending_due, retry_due), valid_alert, freshness)


def dispatch(engine, *, now: datetime | None = None, send_email: bool = False,
             mailer=None) -> dict:
    """Reserva transaccional ANTES de SMTP y cero reenvíos de resultado incierto.

    La transición condicional UPDATE...RETURNING es un CAS en PostgreSQL:
    dos workers que seleccionen el mismo ID solo pueden reservarlo una vez.
    La reserva se confirma antes de llamar a un sistema externo. Un crash
    posterior deja SMTP_OUTCOME_UNKNOWN, que exige reconciliación manual.
    """
    now = _now(now)
    sent = failed = uncertain = 0
    # Fase D: cuando GitHub Actions ejecuta una prueba manual, el servidor
    # permite enviar ÚNICAMENTE al destinatario de prueba autorizado.
    # La protección es del backend (SELECT y UPDATE CAS), nunca solo del YAML.
    test_mode = send_email and os.getenv('OPERATIONAL_EMAIL_TEST_MODE', '').lower() == 'true'
    test_destination = os.getenv('OPERATIONAL_EMAIL_TEST_RECIPIENT', '').strip().lower()
    # Cron: lote acotado para no vaciar masivamente una cola recién habilitada.
    batch_limit = 200
    if send_email and not test_mode:
        batch_limit_str = os.getenv('OPERATIONAL_EMAIL_BATCH_LIMIT', '10').strip()
        if not re.fullmatch(r'[0-9]{1,2}', batch_limit_str) or not 1 <= int(batch_limit_str) <= 50:
            raise ValueError('OPERATIONAL_EMAIL_BATCH_LIMIT debe estar entre 1 y 50')
        batch_limit = int(batch_limit_str)
    if test_mode and not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', test_destination):
        raise ValueError('Falta destinatario válido para prueba operativa')
    destination_guard = (
        and_(deliveries.c.channel == 'email',
             func.lower(deliveries.c.destination_ref) == test_destination)
        if test_mode else None
    )
    # Transporte inyectado exclusivamente para pruebas deterministas; se
    # contrata que el fake eleva excepciones solo si NO efectuó la entrega.
    injected = mailer is not None
    mailer = mailer if mailer is not None else _send_email
    # Comprobar configuracion antes de reservar cualquier entrega.
    email_age = _operational_email_max_age() if send_email else None
    expired = (_expire_old_email_deliveries(engine, now, email_age, destination_guard)
               if send_email else 0)
    with engine.connect() as conn:
        # Excluir email ANTES del LIMIT: miles de correos pendientes no deben
        # impedir que se publiquen entregas in_app en modo seguro por defecto.
        candidates = select(deliveries.c.id).where(_eligible_delivery(now, email_age=email_age))
        if destination_guard is not None:
            candidates = candidates.where(destination_guard)
        if not send_email:
            candidates = candidates.where(deliveries.c.channel != 'email')
        # La prueba manual procesa como máximo UNA entrega aprobada por ejecución.
        # El cron ordinario conserva su lote de 200 entregas internas.
        candidate_ids = conn.execute(candidates
            .order_by(deliveries.c.created_at.asc(), deliveries.c.id.asc())
            .limit(1 if test_mode else batch_limit)).scalars().all()

    for delivery_id in candidate_ids:
        # Mantener los correos completamente desactivados si no se usó
        # --send-email. El canal in_app permanece operativo.
        with engine.begin() as conn:
            # Filtro sin efectos secundarios si la entrega fue reservada por otro worker.
            if not send_email:
                is_email = conn.execute(select(deliveries.c.channel).where(
                    deliveries.c.id == delivery_id)).scalar_one_or_none() == 'email'
                if is_email:
                    continue
            claim_conditions = [deliveries.c.id == delivery_id,
                                _eligible_delivery(now, email_age=email_age)]
            # Evita TOCTOU si el destino cambia mientras esperamos una reserva.
            if destination_guard is not None:
                claim_conditions.append(destination_guard)
            claimed = conn.execute(update(deliveries).where(
                *claim_conditions,
            ).values(
                status='failed',
                attempts=deliveries.c.attempts + 1,
                last_attempt_at=now,
                next_attempt_at=None,
                error_code=SMTP_OUTCOME_UNKNOWN,
            ).returning(
                deliveries.c.id, deliveries.c.alert_id, deliveries.c.channel,
                deliveries.c.destination_ref, deliveries.c.attempts,
            )).mappings().first()
            if not claimed:
                continue
            d = dict(claimed)
            # El canal interno no requiere efecto externo; se confirma en
            # la misma transacción de la reserva.
            if d['channel'] == 'in_app':
                conn.execute(update(deliveries).where(deliveries.c.id == delivery_id).values(
                    status='sent', delivered_at=now, error_code=None,
                ))
                conn.execute(update(alerts).where(alerts.c.id == d['alert_id']).values(status='sent'))
                _audit(conn, action='alert.delivery.sent', table='alert_deliveries',
                       entity_id=delivery_id, after={
                           'channel': 'in_app', 'attempts': d['attempts'], 'status': 'sent',
                       })
                sent += 1
                continue
            # En producción se espera solo email o in_app; ante datos
            # corruptos bloquear, jamás intentar un transporte desconocido.
            if d['channel'] != 'email':
                _audit(conn, action='alert.delivery.uncertain', table='alert_deliveries',
                       entity_id=delivery_id, after={'channel': 'unknown', 'status': 'review_required'})
                uncertain += 1
                continue
            # El commit ocurre AL SALIR de este with, ANTES del SMTP.
            _audit(conn, action='alert.delivery.claimed', table='alert_deliveries',
                   entity_id=delivery_id, after={
                       'channel': 'email', 'attempts': d['attempts'], 'status': 'reserved',
                   })

        # Obtener contenido SOLO para una entrega reservada y autorizada.
        # Si falla la consulta previa a SMTP, el resultado permanece incierto
        # pero no se envía nada sin tener título/mensaje verificables.
        try:
            with engine.connect() as conn:
                content = conn.execute(select(alerts.c.title, alerts.c.message)
                    .where(alerts.c.id == d['alert_id'])).first()
            if content is None:
                raise SMTPBeforeSubmissionError('ALERT_MISSING')
            mailer(d['destination_ref'], content.title, content.message)
            mail_error = None
        except Exception as exc:
            # La implementación real diferencia fallos antes del envío.
            # Los fakes usados en tests representan rechazos sin entrega.
            safe_retry = isinstance(exc, SMTPBeforeSubmissionError) or injected
            mail_error = SMTP_SEND_FAILED if safe_retry else SMTP_OUTCOME_UNKNOWN

        with engine.begin() as conn:
            # No sobrescribir un estado editado por una reconciliación manual.
            values = (
                {'status': 'sent', 'delivered_at': now, 'next_attempt_at': None, 'error_code': None}
                if mail_error is None else
                {'status': 'failed', 'next_attempt_at':
                 now + timedelta(seconds=60 * (2 ** (d['attempts'] - 1)))
                 if mail_error == SMTP_SEND_FAILED and d['attempts'] < MAX_ATTEMPTS else None,
                 'error_code': mail_error}
            )
            updated = conn.execute(update(deliveries).where(
                deliveries.c.id == delivery_id,
                deliveries.c.status == 'failed',
                deliveries.c.error_code == SMTP_OUTCOME_UNKNOWN,
                deliveries.c.attempts == d['attempts'],
            ).values(**values).returning(deliveries.c.id)).scalar_one_or_none()
            if updated is None:
                # Si otra operación modificó la reserva, no afirmar resultado.
                continue
            conn.execute(update(alerts).where(alerts.c.id == d['alert_id']).values(
                status='sent' if mail_error is None else 'failed'))
            audit_action = ('alert.delivery.sent' if mail_error is None else
                            'alert.delivery.failed' if mail_error == SMTP_SEND_FAILED else
                            'alert.delivery.uncertain')
            _audit(conn, action=audit_action, table='alert_deliveries',
                   entity_id=delivery_id, after={
                       'channel': 'email', 'attempts': d['attempts'],
                       'status': 'sent' if mail_error is None else
                       'retry_scheduled' if mail_error == SMTP_SEND_FAILED else 'review_required',
                   })
            if mail_error is None:
                sent += 1
            elif mail_error == SMTP_SEND_FAILED:
                failed += 1
            else:
                uncertain += 1

    return {'sent': sent, 'failed': failed, 'uncertain': uncertain,
            'expired': expired, 'email_enabled': send_email}


def acknowledge(engine, *, delivery_id: UUID, actor_email: str, now: datetime | None = None) -> None:
    """Acuse MANUAL único de operador; no certifica lectura de correo del receptor."""
    with engine.begin() as conn:
        actor_id = _actor(conn, actor_email)
        changed = conn.execute(update(deliveries).where(
            deliveries.c.id == delivery_id, deliveries.c.status == 'sent',
            deliveries.c.acknowledged_at.is_(None),
        ).values(acknowledged_at=_now(now)).returning(deliveries.c.id)).scalar_one_or_none()
        if changed is None:
            raise ValueError('Solo se puede acusar una entrega publicada sin acuse previo')
        _audit(conn, action='alert.delivery.acknowledged', table='alert_deliveries',
               entity_id=delivery_id, actor_id=actor_id)
