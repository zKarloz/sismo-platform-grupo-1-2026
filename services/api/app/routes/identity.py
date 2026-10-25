"""Endpoints autenticados de identidad, gestión de cuentas y auditoría.

Ningún endpoint permite elegir actor_id: se deriva del JWT validado y de la BD.
"""
from uuid import UUID
import re
from typing import Literal
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, SecretStr, ConfigDict
from sqlalchemy import func, or_, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.auth.security import Principal, ROLES, require_roles, require_user
from app.db.session import get_read_engine
from app.db.tables import users, audit_logs
from app.core.config import settings
from app.auth.provisioning import create_auth_identity, delete_created_identity, ProvisioningError

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


class AccountCreate(BaseModel):
    """Campos controlados por Administrador, sin IDs ni rol de autor arbitrarios."""
    model_config = ConfigDict(extra='forbid')
    full_name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=254)
    role: Literal['administrador', 'analista', 'operador_alertas', 'auditor', 'solo_lectura']
    mode: Literal['invite', 'demo'] = 'invite'
    password: SecretStr | None = None



@router.get('/admin/users')
def list_users(page: int = Query(1, ge=1, le=100000),
               page_size: int = Query(10, ge=5, le=50),
               q: str = Query('', max_length=100),
               role: str = Query('', max_length=30),
               status: str = Query('', max_length=20),
               principal: Principal = Depends(require_roles('administrador', 'auditor')),
               engine: Engine = Depends(get_read_engine)) -> dict:
    """Paginación real desde PostgreSQL, búsqueda y filtros; nunca listas masivas."""
    if role and role not in ROLES:
        raise HTTPException(422, 'Rol de filtro inválido')
    if status and status not in ('active', 'inactive', 'suspended'):
        raise HTTPException(422, 'Estado de filtro inválido')
    where = []
    if q.strip():
        # Escapar %/_: la búsqueda textual no interpreta patrones ingresados.
        needle = q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        where.append(or_(users.c.full_name.ilike(f'%{needle}%', escape='\\'),
                         users.c.email.ilike(f'%{needle}%', escape='\\')))
    if role:
        where.append(users.c.role == role)
    if status:
        where.append(users.c.status == status)
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(users).where(*where)).scalar_one()
            rows = conn.execute(select(
                users.c.id, users.c.full_name, users.c.email,
                users.c.role, users.c.status, users.c.auth_user_id, users.c.created_at,
            ).where(*where).order_by(users.c.created_at.desc(), users.c.id.desc())
              .limit(page_size).offset((page-1)*page_size)).mappings().all()
        return {'items': [dict(r) for r in rows], 'total': total,
                'page': page, 'page_size': page_size,
                'pages': max(1, (total + page_size-1)//page_size),
                'demo_enabled': settings.allow_demo_user_creation and settings.environment == 'development'}
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo consultar usuarios') from None


@router.post('/admin/users', status_code=201)
def create_user(data: AccountCreate,
                principal: Principal = Depends(require_roles('administrador')),
                engine: Engine = Depends(get_read_engine)) -> dict:
    """Crea en Supabase Auth y vincula en una transacción con auditoría sin secretos."""
    # Validar reglas cruzadas AQUÍ, no en model_validator: FastAPI puede
    # incluir `input` (contraseña de la solicitud) en errores Pydantic 422.
    name = data.full_name.strip()
    email = data.email.strip().lower()
    if len(name) < 2 or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise HTTPException(422, 'Nombre o correo inválido')
    if data.mode == 'invite' and data.password is not None:
        raise HTTPException(422, 'Una invitación no debe contener contraseña')
    if data.mode == 'demo':
        if not (settings.allow_demo_user_creation and settings.environment == 'development'):
            raise HTTPException(422, 'La creación de cuentas ficticias está deshabilitada')
        if not email.endswith(('.test', '.example', '.invalid')):
            raise HTTPException(422, 'Las cuentas ficticias deben usar un dominio .test')
        if not data.password or len(data.password.get_secret_value()) < 12:
            raise HTTPException(422, 'La contraseña temporal debe tener al menos 12 caracteres')
    if not settings.supabase_secret_key:
        raise HTTPException(503, 'Configura SUPABASE_SECRET_KEY solo en el backend')
    try:
        with engine.connect() as conn:
            found = conn.execute(select(users.c.id).where(
                func.lower(users.c.email) == email)).first()
            if found:
                raise HTTPException(409, 'Ya existe una cuenta local con este correo')
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo verificar el correo') from None

    try:
        auth_id = create_auth_identity(
            email=email, name=name, mode=data.mode,
            password=data.password.get_secret_value() if data.password else None,
        )
    except ProvisioningError as exc:
        raise HTTPException(exc.status_code, exc.message) from None

    try:
        with engine.begin() as conn:
            # Índice único (lower(email)) y auth_user_id previenen carreras.
            user_id = conn.execute(users.insert().values(
                auth_user_id=auth_id, email=email, full_name=name,
                role=data.role, status='active',
            ).returning(users.c.id)).scalar_one()
            conn.execute(audit_logs.insert().values(
                actor_id=principal.id, action='identity.user.invited' if data.mode == 'invite'
                else 'identity.user.demo_created',
                entity_type='users', entity_id=user_id, result='success',
                after_json={'role': data.role, 'status': 'active', 'mode': data.mode},
            ))
    except (SQLAlchemyError, IntegrityError):
        if delete_created_identity(auth_id):
            raise HTTPException(409, 'No se vinculó la cuenta; revisa si el correo ya existe') from None
        raise HTTPException(503, 'La identidad se creó, pero no se vinculó. Revisar con soporte privado') from None
    return {'id': str(user_id), 'role': data.role, 'mode': data.mode,
            'status': 'active', 'auth_user_id': str(auth_id)}


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
