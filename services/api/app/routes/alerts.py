"""Lectura operativa autenticada de avisos IGP/CENSIS, sin destinatarios privados.

Los envíos personales usan endpoints independientes bajo /me/notifications.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.auth.security import Principal, require_roles, require_user
from app.db.session import get_read_engine
from app.db.tables import alert_rules, alerts, deliveries, events, sources, users

router = APIRouter(tags=['Avisos informativos'])
IGP_SOURCE = 'IGP/CENSIS'


@router.get('/alert-rules')
def list_rules(actor: Principal = Depends(require_user),
               engine: Engine = Depends(get_read_engine)) -> dict:
    """Reglas operativas del IGP: sin destinos de correo ni plantillas privadas.

    El actor se comprueba en FastAPI, aunque este endpoint solo devuelve una
    representación reducida para todos los roles autenticados.
    """
    try:
        with engine.connect() as conn:
            items = conn.execute(select(
                alert_rules.c.id, alert_rules.c.name, alert_rules.c.min_magnitude,
                alert_rules.c.max_depth_km, alert_rules.c.zone_spec,
                alert_rules.c.severity, alert_rules.c.channel, alert_rules.c.enabled,
                alert_rules.c.requires_approval, alert_rules.c.cooldown_seconds,
                alert_rules.c.activated_at, sources.c.name.label('source_name'),
            ).select_from(alert_rules.join(sources, alert_rules.c.source_id == sources.c.id))
                .where(sources.c.name == IGP_SOURCE)
                .order_by(alert_rules.c.created_at.desc()).limit(100)).mappings().all()
        return {'items': [dict(x) for x in items]}
    except SQLAlchemyError:
        raise HTTPException(503, 'Reglas no disponibles. Revisar migración 004') from None


@router.get('/alerts')
def list_alerts(page: int = Query(1, ge=1), page_size: int = Query(5, ge=1, le=100),
                status: str | None = Query(None, pattern='^(pending|approved|sent|failed|cancelled)$'),
                actor: Principal = Depends(require_user),
                engine: Engine = Depends(get_read_engine)) -> dict:
    """Historial paginado IGP sin emails, direcciones ni secretos SMTP.

    Los datos de entrega permiten distinguir aceptación SMTP de lectura real.
    Se exponen códigos de error genéricos, nunca respuestas SMTP crudas.
    """
    where = [sources.c.name == IGP_SOURCE]
    if status:
        where.append(alerts.c.status == status)
    relation = alerts.join(events, alerts.c.event_id == events.c.id).join(
        alert_rules, alerts.c.rule_id == alert_rules.c.id).join(
        sources, events.c.source_id == sources.c.id).outerjoin(
        users, alerts.c.approved_by == users.c.id)
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(relation).where(*where)).scalar_one()
            rows = conn.execute(select(
                alerts.c.id, alerts.c.event_id, alerts.c.severity, alerts.c.title,
                alerts.c.message, alerts.c.source_url, alerts.c.status,
                alerts.c.disclaimer, alerts.c.created_at, alerts.c.approved_at,
                users.c.full_name.label('approved_by_name'),
                events.c.occurred_at, events.c.magnitude, events.c.place,
                sources.c.name.label('source_name'), alert_rules.c.name.label('rule_name'),
                alert_rules.c.channel,
            ).select_from(relation).where(*where)
                .order_by(alerts.c.created_at.desc(), alerts.c.id.desc())
                .offset((page - 1) * page_size).limit(page_size)).mappings().all()
            ids = [x['id'] for x in rows]
            delivery_rows = conn.execute(select(
                deliveries.c.alert_id, deliveries.c.status, deliveries.c.attempts,
                deliveries.c.last_attempt_at, deliveries.c.delivered_at,
                deliveries.c.acknowledged_at, deliveries.c.error_code,
            ).where(deliveries.c.alert_id.in_(ids))).mappings().all() if ids else []
    except SQLAlchemyError:
        raise HTTPException(503, 'Centro de alertas no disponible. Revisar migración 004') from None
    by_alert = {d['alert_id']: dict(d) for d in delivery_rows}
    return {'items': [{**dict(row), 'delivery': by_alert.get(row['id'])} for row in rows],
            'page': page, 'page_size': page_size, 'total': total,
            'disclaimer': 'Avisos informativos posteriores al evento. No son alertas oficiales ni tempranas.'}


# Los errores SMTP crudos nunca se publican; son datos operativos y pueden incluir
# nombres de cuenta, servidores, direcciones o información de autenticación.
SAFE_DELIVERY_ERRORS = frozenset({'SMTP_SEND_FAILED', 'DELIVERY_FAILED', 'SMTP_NOT_CONFIGURED', 'UNKNOWN_CHANNEL', 'SMTP_OUTCOME_UNKNOWN', 'EVENT_TOO_OLD'})


def _delivery_destination(channel: str, destination: str | None) -> str:
    """Presentación privada del destinatario: ni operadores ni auditores reciben el email completo."""
    if channel == 'in_app':
        return 'Centro interno'
    if channel != 'email' or not destination or destination.count('@') != 1:
        return 'Destino protegido'
    local, domain = destination.split('@', 1)
    if not local or not domain or ' ' in domain or '.' not in domain:
        return 'Destino protegido'
    return f'{local[0]}***@{domain}'


@router.get('/alert-deliveries')
def list_alert_deliveries(
    page: int = Query(1, ge=1),
    page_size: int = Query(5, ge=1, le=20),
    status: str | None = Query(None, pattern='^(pending|sent|failed|cancelled|expired)$'),
    channel: str | None = Query(None, pattern='^(in_app|email)$'),
    actor: Principal = Depends(require_roles('administrador', 'operador_alertas', 'auditor')),
    engine: Engine = Depends(get_read_engine),
) -> dict:
    """Entregas reales IGP/CENSIS, paginadas en SQL y limitadas a roles operativos.

    No devuelve destination_ref, mensajes SMTP, secretos ni correos completos.
    `sent` significa publicado en la aplicación o aceptado por SMTP, no leído.
    """
    relation = (deliveries.join(alerts, deliveries.c.alert_id == alerts.c.id)
        .join(events, alerts.c.event_id == events.c.id)
        .join(sources, events.c.source_id == sources.c.id)
        .join(alert_rules, alerts.c.rule_id == alert_rules.c.id))
    conditions = [sources.c.name == IGP_SOURCE]
    # 'Caducada' es una cancelación técnica por EVENT_TOO_OLD; diferenciarla
    # de las cancelaciones administrativas sin modificar el enum PostgreSQL.
    if status == 'expired':
        conditions.extend([deliveries.c.status == 'cancelled', deliveries.c.error_code == 'EVENT_TOO_OLD'])
    elif status == 'cancelled':
        conditions.extend([deliveries.c.status == 'cancelled',
                           or_(deliveries.c.error_code.is_(None), deliveries.c.error_code != 'EVENT_TOO_OLD')])
    elif status:
        conditions.append(deliveries.c.status == status)
    if channel:
        conditions.append(deliveries.c.channel == channel)
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(relation).where(*conditions)).scalar_one()
            rows = conn.execute(select(
                deliveries.c.id, deliveries.c.alert_id, deliveries.c.channel,
                deliveries.c.destination_ref, deliveries.c.status, deliveries.c.attempts,
                deliveries.c.created_at, deliveries.c.last_attempt_at,
                deliveries.c.next_attempt_at, deliveries.c.delivered_at,
                deliveries.c.acknowledged_at, deliveries.c.error_code,
                alerts.c.title.label('alert_title'), alerts.c.status.label('alert_status'),
                alerts.c.source_url, events.c.occurred_at, events.c.magnitude,
                events.c.place, alert_rules.c.name.label('rule_name'),
            ).select_from(relation).where(*conditions)
                .order_by(deliveries.c.created_at.desc(), deliveries.c.id.desc())
                .offset((page - 1) * page_size).limit(page_size)).mappings().all()
    except SQLAlchemyError:
        raise HTTPException(503, 'Historial de entregas no disponible') from None

    items = []
    for row in rows:
        item = dict(row)
        item['destination_display'] = _delivery_destination(item['channel'], item.pop('destination_ref'))
        code = item['error_code']
        item['error_code'] = code if code in SAFE_DELIVERY_ERRORS else ('ERROR_NO_CLASIFICADO' if code else None)
        items.append(item)
    return {
        'items': items, 'total': total, 'page': page, 'page_size': page_size,
        'disclaimer': 'Enviado significa publicación interna o aceptación SMTP; no confirma recepción ni lectura.',
    }
