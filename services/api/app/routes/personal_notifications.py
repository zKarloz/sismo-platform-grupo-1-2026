"""Preferencias de correo personales: nunca se acepta un user_id del navegador."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.notifications.service import history_for, preference_for, set_preference

router = APIRouter(prefix='/me/notifications', tags=['Mis notificaciones'])


class PreferenceInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: bool
    min_magnitude: float = Field(ge=2.0, le=9.0)


@router.get('')
def get_personal_preference(user: Principal = Depends(require_user),
                            engine: Engine = Depends(get_read_engine)) -> dict:
    try:
        return preference_for(engine, user.id)
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo consultar la preferencia') from None


@router.patch('')
def update_personal_preference(data: PreferenceInput,
                               user: Principal = Depends(require_user),
                               engine: Engine = Depends(get_read_engine)) -> dict:
    try:
        return set_preference(engine, user_id=user.id,
                              enabled=data.enabled, min_magnitude=data.min_magnitude)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo guardar la preferencia') from None


@router.get('/history')
def personal_history(page: int = Query(1, ge=1),
                     page_size: int = Query(10, ge=5, le=50),
                     user: Principal = Depends(require_user),
                     engine: Engine = Depends(get_read_engine)) -> dict:
    try:
        return history_for(engine, user_id=user.id, page=page, page_size=page_size)
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo consultar el historial') from None
