"""Acciones sensibles de la Fase 7, ahora protegidas por identidad y rol."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.auth.security import Principal, require_roles
from app.alerts.service import create_rule, activate_rule, review, simulate
from app.db.session import get_read_engine

router = APIRouter(tags=['Operación autorizada de alertas'])


class RuleInput(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    min_magnitude: float = Field(ge=0, le=10)
    source: str = 'IGP/CENSIS'
    channel: str = 'in_app'
    severity: str = 'review'
    max_depth_km: float | None = None
    cooldown_seconds: int = Field(default=1800, ge=0, le=86400)
    requires_approval: bool = True
    zone_spec: dict[str, float] = Field(default_factory=lambda: {
        'min_lat': -19.5, 'max_lat': 0.5, 'min_lon': -84, 'max_lon': -68,
    })
    template_title: str = 'Sismo registrado: M {magnitude}'
    template_body: str = 'Sismo M {magnitude} en {place}; {source_url}'


@router.post('/admin/alert-rules', status_code=201)
def new_rule(data: RuleInput, actor: Principal = Depends(require_roles('administrador')),
             engine: Engine = Depends(get_read_engine)) -> dict:
    """Crea una regla siempre desactivada; nunca admite enviar email desde navegador."""
    if data.channel != 'in_app':
        raise HTTPException(422, 'Crear reglas de correo solo mediante CLI privado')
    try:
        rule_id = create_rule(engine, actor_email=actor.email, name=data.name,
            min_magnitude=data.min_magnitude, zone=data.zone_spec,
            source=data.source, channel=data.channel, severity=data.severity,
            max_depth_km=data.max_depth_km, cooldown_seconds=data.cooldown_seconds,
            requires_approval=data.requires_approval,
            title=data.template_title, body=data.template_body)
        return {'rule_id': rule_id, 'enabled': False}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    except IntegrityError:
        raise HTTPException(409, 'Nombre de regla ya utilizado') from None
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo crear regla') from None


@router.post('/admin/alert-rules/{rule_id}/activation')
def toggle_rule(rule_id: UUID, enabled: bool,
                actor: Principal = Depends(require_roles('administrador')),
                engine: Engine = Depends(get_read_engine)) -> dict:
    """La marca activated_at evita generar avisos por el histórico anterior."""
    try:
        activate_rule(engine, rule_id=rule_id, actor_email=actor.email, enabled=enabled)
        return {'ok': True, 'enabled': enabled}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo modificar regla') from None


@router.post('/admin/alerts/{alert_id}/review')
def review_alert(alert_id: UUID, approve: bool,
                 actor: Principal = Depends(require_roles('administrador', 'operador_alertas')),
                 engine: Engine = Depends(get_read_engine)) -> dict:
    """Aprobación/cancelación vinculada a identidad real y auditada."""
    try:
        review(engine, alert_id=alert_id, actor_email=actor.email, approve=approve)
        return {'ok': True, 'status': 'approved' if approve else 'cancelled'}
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from None
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo revisar alerta') from None


@router.get('/admin/alert-rules/{rule_id}/simulate/{event_id}')
def test_rule(rule_id: UUID, event_id: UUID,
              actor: Principal = Depends(require_roles('administrador', 'analista', 'operador_alertas')),
              engine: Engine = Depends(get_read_engine)) -> dict:
    """Simulación no persiste ni envía nada."""
    try:
        return simulate(engine, rule_id=rule_id, event_id=event_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from None
    except SQLAlchemyError:
        raise HTTPException(503, 'Simulación no disponible') from None
