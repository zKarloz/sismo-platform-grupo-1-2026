"""Filtros coherentes para historial paginado y exportación de auditoría.

Las fechas del formulario son fechas civiles del Perú; la BD almacena UTC.
No se consultan los valores JSON para búsquedas ni se filtra por IP.
"""
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import and_, not_, or_

from app.db.tables import audit_logs, users

AuditCategory = Literal['todos', 'accesos', 'usuarios', 'reglas', 'alertas', 'sistema']
AuditResult = Literal['todos', 'success', 'failed', 'partial']
PERU = ZoneInfo('America/Lima')


def audit_join():
    """LEFT JOIN conserva procesos automáticos y usuarios dados de baja."""
    actor = users.alias('audit_actor')
    subject = users.alias('audit_subject')
    relation = audit_logs.outerjoin(actor, audit_logs.c.actor_id == actor.c.id).outerjoin(
        subject, (audit_logs.c.entity_type == 'users') & (audit_logs.c.entity_id == subject.c.id))
    return relation, actor, subject


def audit_conditions(q: str, category: AuditCategory, result: AuditResult,
                     start_date: date | None, end_date: date | None, actor, subject):
    """Construye SQL parametrizado con categorías equivalentes a la interfaz."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, 'El inicio del periodo es posterior al final')
    conditions = []
    if q.strip():
        escaped = q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        like = f'%{escaped}%'
        conditions.append(or_(actor.c.full_name.ilike(like, escape='\\'),
                              subject.c.full_name.ilike(like, escape='\\'),
                              audit_logs.c.action.ilike(like, escape='\\'),
                              audit_logs.c.entity_type.ilike(like, escape='\\')))
    action = audit_logs.c.action
    accesses = action.like('identity.session.%')
    people = or_(action.like('identity.user.%'), action.like('notification.preference.%'))
    rules = action.like('alert.rule.%')
    alerts = or_(and_(action.like('alert.%'), not_(rules)), action.like('notification.delivery.%'))
    by_category = {'accesos': accesses, 'usuarios': people, 'reglas': rules, 'alertas': alerts,
                   'sistema': not_(or_(accesses, people, rules, alerts))}
    if category != 'todos':
        conditions.append(by_category[category])
    if result == 'failed':
        conditions.append(audit_logs.c.result.in_(('failed', 'failure', 'error')))
    elif result != 'todos':
        conditions.append(audit_logs.c.result == result)
    if start_date:
        start = datetime.combine(start_date, time.min, tzinfo=PERU).astimezone(timezone.utc)
        conditions.append(audit_logs.c.occurred_at >= start)
    if end_date:
        if end_date == date.max:
            raise HTTPException(422, 'Fecha final fuera de rango')
        # Fin exclusivo: incluye todas las horas del último día civil peruano.
        end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=PERU).astimezone(timezone.utc)
        conditions.append(audit_logs.c.occurred_at < end)
    return conditions


SENSITIVE_KEYS = ('password', 'passwd', 'token', 'secret', 'credential', 'authorization',
                  'apikey', 'api_key', 'jwt', 'cookie', 'private_key', 'smtp_password')


def sanitized_json(value):
    """Defensa adicional: nunca exponer secretos presentes en registros antiguos."""
    if isinstance(value, dict):
        return {key: ('[REDACTADO]' if any(word in str(key).lower() for word in SENSITIVE_KEYS)
                      else sanitized_json(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitized_json(item) for item in value]
    return value
