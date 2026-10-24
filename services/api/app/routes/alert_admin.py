"""Acciones sensibles de la Fase 7, ahora protegidas por identidad y rol."""
from uuid import UUID
import smtplib
from pydantic import SecretStr

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.auth.security import Principal, require_roles
from app.alerts.service import create_rule, activate_rule, review, simulate
from app.alerts.gmail_test import (smtp_server_status, reserve_test,
    record_test_success, send_gmail_test)
from app.db.session import get_read_engine

router = APIRouter(tags=['Operación autorizada de alertas'])


class RuleInput(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    min_magnitude: float = Field(ge=0, le=10)
    source: str = 'IGP/CENSIS'
    channel: str = 'in_app'
    destination: str | None = Field(default=None, max_length=254)
    severity: str = 'review'
    max_depth_km: float | None = None
    cooldown_seconds: int = Field(default=1800, ge=0, le=86400)
    requires_approval: bool = True
    zone_spec: dict[str, float] = Field(default_factory=lambda: {
        'min_lat': -19.5, 'max_lat': 0.5, 'min_lon': -84, 'max_lon': -68,
    })
    start_hour_peru: int | None = None
    end_hour_peru: int | None = None
    template_title: str = 'Sismo registrado: M {magnitude}'
    template_body: str = 'Sismo M {magnitude} en {place}; {source_url}'


@router.post('/admin/alert-rules', status_code=201)
def new_rule(data: RuleInput, actor: Principal = Depends(require_roles('administrador')),
             engine: Engine = Depends(get_read_engine)) -> dict:
    """Crea una regla desactivada; el email requiere siempre revisión humana.

    El secreto SMTP jamás es parte de RuleInput ni se almacena en alert_rules.
    """
    if data.channel not in ('in_app', 'email'):
        raise HTTPException(422, 'Canal no permitido')
    if data.channel == 'email' and not data.requires_approval:
        raise HTTPException(422, 'El correo requiere aprobación humana')
    try:
        rule_id = create_rule(engine, actor_email=actor.email, name=data.name,
            min_magnitude=data.min_magnitude, zone=data.zone_spec,
            source=data.source, channel=data.channel, severity=data.severity,
            destination=data.destination,
            max_depth_km=data.max_depth_km, cooldown_seconds=data.cooldown_seconds,
            requires_approval=data.requires_approval,
            start_hour_peru=data.start_hour_peru, end_hour_peru=data.end_hour_peru,
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


class GmailTestInput(BaseModel):
    """Solo datos efímeros de UNA prueba SMTP; no persistir la contraseña."""
    gmail: str = Field(min_length=6, max_length=254)
    app_password: SecretStr = Field(min_length=16, max_length=32)


@router.get('/admin/smtp/status')
def smtp_status(actor: Principal = Depends(require_roles('administrador'))) -> dict:
    """Indica si Render tiene SMTP configurado, sin leer ni enviar secretos al navegador."""
    return smtp_server_status()


@router.post('/admin/smtp/gmail-test')
def gmail_test(data: GmailTestInput,
               actor: Principal = Depends(require_roles('administrador')),
               engine: Engine = Depends(get_read_engine)) -> dict:
    """Prueba a la dirección del administrador; no habilita envíos posteriores.

    El secreto se recibe solo en la solicitud HTTPS, se usa una vez y se descarta.
    Se limita la frecuencia en PostgreSQL y no se expone el error crudo de SMTP.
    """
    try:
        reserve_test(engine, actor_id=actor.id)
    except ValueError as exc:
        raise HTTPException(429, str(exc)) from None
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo comprobar el límite de pruebas') from None
    try:
        send_gmail_test(gmail=data.gmail.strip(),
                        app_password=data.app_password.get_secret_value(),
                        destination=actor.email)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    except (smtplib.SMTPException, TimeoutError, OSError):
        raise HTTPException(502, 'Gmail no aceptó el envío. Revisa la verificación en dos pasos, '
                            'la contraseña de aplicación y la conexión SMTP.') from None
    try:
        record_test_success(engine, actor_id=actor.id)
    except SQLAlchemyError:
        # No repetir un correo ya aceptado solo porque falló auditar el resultado.
        raise HTTPException(503, 'Gmail aceptó el correo, pero no se pudo confirmar la auditoría') from None
    return {'accepted_by_smtp': True, 'type': 'technical_test',
            'note': 'Comprueba la bandeja de entrada; no se creó ninguna alerta operativa.'}
