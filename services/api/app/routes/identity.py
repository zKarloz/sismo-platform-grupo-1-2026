"""Endpoints autenticados de identidad, gestión de cuentas y auditoría.

Ningún endpoint permite elegir actor_id: se deriva del JWT validado y de la BD.
"""
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.auth.security import Principal, ROLES, require_roles, require_user
from app.db.session import get_read_engine
from app.db.tables import users, audit_logs

router = APIRouter(tags=['Identidad y permisos'])


class AccountUpdate(BaseModel):
    role: str | None = None
    status: str | None = None


@router.get('/auth/me')
def me(principal: Principal = Depends(require_user)) -> dict:
    """Una sesión es válida solo si su UUID Auth está vinculado a cuenta activa."""
    return dict(id=principal.id, auth_user_id=principal.auth_user_id,
                email=principal.email, full_name=principal.full_name,
                role=principal.role, status=principal.status)


@router.post('/auth/session')
def register_session(principal: Principal = Depends(require_user),
                     engine: Engine = Depends(get_read_engine)) -> dict:
    """Bitácora de ingreso tras login verificado; sin contraseñas, JWT o dirección IP."""
    try:
        with engine.begin() as conn:
            conn.execute(update(users).where(users.c.id == principal.id)
                         .values(last_login_at=datetime.now(timezone.utc)))
            conn.execute(audit_logs.insert().values(
                actor_id=principal.id, action='identity.session.started',
                entity_type='users', entity_id=principal.id,
                after_json={'method': 'supabase_auth'}, result='success',
            ))
        return {'ok': True}
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo registrar el acceso') from None


@router.get('/admin/users')
def list_users(principal: Principal = Depends(require_roles('administrador', 'auditor')),
               engine: Engine = Depends(get_read_engine)) -> dict:
    """Lista limitada, nunca se exponen hashes/tokens/claves Supabase."""
    try:
        with engine.connect() as conn:
            rows = conn.execute(select(users.c.id, users.c.full_name, users.c.email,
                users.c.role, users.c.status, users.c.auth_user_id,
                users.c.created_at).order_by(users.c.created_at.desc()).limit(200)).mappings().all()
        return {'items': [dict(r) for r in rows]}
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo consultar usuarios') from None


@router.patch('/admin/users/{user_id}')
def edit_user(user_id: UUID, data: AccountUpdate,
              principal: Principal = Depends(require_roles('administrador')),
              engine: Engine = Depends(get_read_engine)) -> dict:
    """RBAC real y bitácora; impide desactivar el propio administrador."""
    if data.role is not None and data.role not in ROLES:
        raise HTTPException(422, 'Rol inválido')
    if data.status is not None and data.status not in ('active', 'inactive', 'suspended'):
        raise HTTPException(422, 'Estado inválido')
    if data.role is None and data.status is None:
        raise HTTPException(422, 'Indica rol o estado')
    if user_id == principal.id:
        raise HTTPException(409, 'No puedes cambiar tu propio rol o estado')
    try:
        with engine.begin() as conn:
            # Evita dos ediciones administrativas concurrentes con PostgreSQL.
            row = conn.execute(select(users).where(users.c.id == user_id)
                               .with_for_update()).mappings().first()
            if row is None:
                raise HTTPException(404, 'Usuario inexistente')
            before = {'role': row['role'], 'status': row['status']}
            values = {'role': data.role or row['role'], 'status': data.status or row['status']}
            conn.execute(update(users).where(users.c.id == user_id).values(**values))
            conn.execute(audit_logs.insert().values(
                actor_id=principal.id, action='identity.user.updated',
                entity_type='users', entity_id=user_id,
                before_json=before, after_json=values, result='success',
            ))
        return {'ok': True, 'id': str(user_id), **values}
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo actualizar usuario') from None


@router.get('/admin/audit')
def list_audit(limit: int = Query(50, ge=1, le=200),
               principal: Principal = Depends(require_roles('administrador', 'auditor')),
               engine: Engine = Depends(get_read_engine)) -> dict:
    """Historial protegido: metadatos y cambios sin secretos ni direcciones privadas."""
    try:
        # El ID de auditoría sigue disponible para soporte, pero la interfaz recibe
        # nombres legibles. LEFT JOIN conserva las operaciones automáticas (actor NULL)
        # y las entradas cuyo usuario haya dejado de existir.
        actor = users.alias('audit_actor')
        subject = users.alias('audit_subject')
        relation = audit_logs.outerjoin(
            actor, audit_logs.c.actor_id == actor.c.id,
        ).outerjoin(
            subject,
            (audit_logs.c.entity_type == 'users') & (audit_logs.c.entity_id == subject.c.id),
        )
        with engine.connect() as conn:
            rows = conn.execute(select(
                audit_logs.c.id, audit_logs.c.actor_id, audit_logs.c.action,
                audit_logs.c.entity_type, audit_logs.c.entity_id,
                audit_logs.c.before_json, audit_logs.c.after_json,
                audit_logs.c.result, audit_logs.c.occurred_at,
                actor.c.full_name.label('actor_name'),
                actor.c.role.label('actor_role'),
                subject.c.full_name.label('subject_name'),
            ).select_from(relation).order_by(
                audit_logs.c.occurred_at.desc(), audit_logs.c.id.desc(),
            ).limit(limit)).mappings().all()
        # actor_role describe el rol ACTUAL; el esquema histórico no guarda
        # instantáneas del rol que tenía el actor en el momento de la operación.
        return {'items': [dict(row) for row in rows]}
    except SQLAlchemyError:
        raise HTTPException(503, 'Auditoría no disponible') from None
