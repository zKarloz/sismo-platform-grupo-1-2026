"""Lectura operativa autenticada de avisos IGP/CENSIS, sin destinatarios privados.

Los envíos personales usan endpoints independientes bajo /me/notifications.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.auth.security import Principal, require_user
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
