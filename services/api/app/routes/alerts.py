"""Centro público de lectura limitada. Escrituras vía CLI, no HTTP.

NO incluye correos de destinatarios, cuentas ni auditoría privada.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_read_engine
from app.db.tables import alert_rules, alerts, deliveries, events, sources

router = APIRouter(tags=['Avisos informativos'])


@router.get('/alert-rules')
def list_rules(engine: Engine = Depends(get_read_engine)) -> dict:
    """Solo reglas activadas o desactivadas, sin destinatarios internos."""
    try:
        with engine.connect() as conn:
            items = conn.execute(select(
                alert_rules.c.id, alert_rules.c.name, alert_rules.c.min_magnitude,
                alert_rules.c.max_depth_km, alert_rules.c.zone_spec,
                alert_rules.c.severity, alert_rules.c.channel, alert_rules.c.enabled,
                alert_rules.c.requires_approval, alert_rules.c.cooldown_seconds,
                alert_rules.c.activated_at, sources.c.name.label('source_name'),
            ).select_from(alert_rules.outerjoin(sources, alert_rules.c.source_id == sources.c.id))
                .order_by(alert_rules.c.created_at.desc()).limit(100)).mappings().all()
        return {'items': [dict(x) for x in items]}
    except SQLAlchemyError:
        raise HTTPException(503, 'Reglas no disponibles. Revisar migración 004') from None


@router.get('/alerts')
def list_alerts(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                status: str | None = Query(None, pattern='^(pending|approved|sent|failed|cancelled)$'),
                engine: Engine = Depends(get_read_engine)) -> dict:
    """Historial observable sin emails, destinos ni identificadores de usuarios."""
    where = [alerts.c.status == status] if status else []
    relation = alerts.join(events, alerts.c.event_id == events.c.id).join(
        alert_rules, alerts.c.rule_id == alert_rules.c.id).join(
        sources, events.c.source_id == sources.c.id)
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(relation).where(*where)).scalar_one()
            rows = conn.execute(select(
                alerts.c.id, alerts.c.severity, alerts.c.title, alerts.c.message,
                alerts.c.source_url, alerts.c.status, alerts.c.disclaimer,
                alerts.c.created_at, alerts.c.approved_at,
                events.c.occurred_at, events.c.magnitude, events.c.place,
                sources.c.name.label('source_name'), alert_rules.c.name.label('rule_name'),
                alert_rules.c.channel,
            ).select_from(relation).where(*where)
                .order_by(alerts.c.created_at.desc(), alerts.c.id.desc())
                .offset((page - 1) * page_size).limit(page_size)).mappings().all()
            # No exponer destino ni códigos SMTP, solo estado y contadores.
            ids = [x['id'] for x in rows]
            delivery_rows = conn.execute(select(
                deliveries.c.alert_id, deliveries.c.status, deliveries.c.attempts,
                deliveries.c.delivered_at, deliveries.c.acknowledged_at,
            ).where(deliveries.c.alert_id.in_(ids))).mappings().all() if ids else []
    except SQLAlchemyError:
        raise HTTPException(503, 'Centro de alertas no disponible. Revisar migración 004') from None
    by_alert = {d['alert_id']: dict(d) for d in delivery_rows}
    return {'items': [{**dict(row), 'delivery': by_alert.get(row['id'])} for row in rows],
            'page': page, 'page_size': page_size, 'total': total,
            'disclaimer': 'Avisos informativos posteriores al evento. No son alertas oficiales ni tempranas.'}
