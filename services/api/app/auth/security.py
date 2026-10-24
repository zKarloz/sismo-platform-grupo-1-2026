"""Validación de tokens Supabase y RBAC. Nunca confiar en rol/email enviados por el cliente."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.db.session import get_read_engine
from app.db.tables import users

_bearer = HTTPBearer(auto_error=False)
ROLES = frozenset({'administrador', 'analista', 'operador_alertas', 'auditor', 'solo_lectura'})


@dataclass(frozen=True)
class Principal:
    id: UUID
    auth_user_id: UUID
    email: str
    full_name: str
    role: str
    status: str


@lru_cache(maxsize=1)
def _jwks() -> PyJWKClient:
    """Llaves públicas con caché; nunca descargar secretos de firma."""
    return PyJWKClient(
        f'{settings.supabase_url.rstrip("/")}/auth/v1/.well-known/jwks.json',
        cache_jwk_set=True, lifespan=600, timeout=8,
    )


def verify_supabase_token(token: str) -> UUID:
    """Firma asimétrica verificable o validación remota del legado HS256.

    HS256 jamás se verifica con la API key del navegador: Supabase recomienda
    pedir al servidor Auth que valide ese JWT heredado.
    """
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(503, 'Autenticación no configurada en FastAPI')
    issuer = f'{settings.supabase_url.rstrip("/")}/auth/v1'
    try:
        header = jwt.get_unverified_header(token)
        algorithm = header.get('alg')
        if algorithm in ('RS256', 'ES256'):
            key = _jwks().get_signing_key_from_jwt(token).key
            claims = jwt.decode(
                token, key, algorithms=['RS256', 'ES256'],
                issuer=issuer, audience='authenticated',
                options={'require': ['sub', 'iss', 'aud', 'exp']},
                leeway=15,
            )
            if claims.get('role') != 'authenticated':
                raise InvalidTokenError('Rol JWT no autorizado')
            return UUID(claims['sub'])
        if algorithm == 'HS256':
            # Tokens HS256: verificación de servidor remoto, no decodificar JWT sin firma.
            response = httpx.get(
                f'{issuer}/user', timeout=8,
                headers={'apikey': settings.supabase_publishable_key,
                         'Authorization': f'Bearer {token}'},
            )
            if response.status_code in (401, 403):
                raise InvalidTokenError('Token rechazado por Auth')
            response.raise_for_status()
            return UUID(response.json()['id'])
    except (InvalidTokenError, ValueError, KeyError, TypeError):
        raise HTTPException(401, 'Sesión no válida o caducada', headers={'WWW-Authenticate': 'Bearer'}) from None
    except (httpx.HTTPError, jwt.PyJWKClientError):
        raise HTTPException(503, 'No se pudo validar la sesión con Supabase') from None
    raise HTTPException(401, 'Algoritmo JWT no admitido', headers={'WWW-Authenticate': 'Bearer'})


def require_user(credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
                 engine: Engine = Depends(get_read_engine)) -> Principal:
    """Busca autorización siempre en DB: no concede roles según claims editables."""
    if not credentials or credentials.scheme.lower() != 'bearer':
        raise HTTPException(401, 'Inicia sesión', headers={'WWW-Authenticate': 'Bearer'})
    auth_id = verify_supabase_token(credentials.credentials)
    try:
        with engine.connect() as conn:
            found = conn.execute(select(users).where(users.c.auth_user_id == auth_id)).mappings().first()
    except SQLAlchemyError:
        raise HTTPException(503, 'Usuarios no disponibles') from None
    if not found or found['status'] != 'active' or found['role'] not in ROLES:
        raise HTTPException(403, 'Cuenta sin acceso: solicita habilitación al administrador')
    return Principal(id=found['id'], auth_user_id=auth_id, email=found['email'],
                     full_name=found['full_name'], role=found['role'], status=found['status'])


def require_roles(*roles: str):
    """Dependencia explícita y reutilizable para permisos de endpoints."""
    def dependency(user: Principal = Depends(require_user)) -> Principal:
        if user.role not in roles:
            raise HTTPException(403, 'Tu rol no permite esta operación')
        return user
    return dependency
