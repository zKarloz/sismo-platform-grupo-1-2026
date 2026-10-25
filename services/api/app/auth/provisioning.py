"""Alta administrativa de identidades Supabase Auth; jamás expone el secreto al navegador.

La creación remota y la inserción PostgreSQL no comparten transacción: el
llamador intentará compensar fallos de BD eliminando SOLO la identidad nueva.
"""
from __future__ import annotations

from uuid import UUID
import httpx

from app.core.config import settings


class ProvisioningError(Exception):
    """Error sin credenciales ni cuerpo de respuesta del proveedor."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _admin_headers() -> dict[str, str]:
    secret = settings.supabase_secret_key
    if not settings.supabase_url or not secret:
        raise ProvisioningError(503, 'Alta de usuarios no configurada en el servidor')
    return {'apikey': secret, 'Authorization': f'Bearer {secret}',
            'Content-Type': 'application/json'}


def create_auth_identity(*, email: str, name: str, mode: str,
                         password: str | None = None) -> UUID:
    """Supabase GoTrue Admin API: invitación o cuenta de DEMO explícita.

    La clave `sb_secret_*` (o service_role legado) SOLO vive en FastAPI.
    """
    headers = _admin_headers()
    base = settings.supabase_url.rstrip('/') + '/auth/v1'
    if mode == 'invite':
        path = '/invite'
        body: dict = {'email': email, 'data': {'full_name': name}}
    else:
        path = '/admin/users'
        body = {'email': email, 'password': password,
                'email_confirm': True, 'user_metadata': {'full_name': name}}
    # El destino es una URL estática configurada en Render, nunca suministrada
    # por el visitante. El enlace se abrirá en la página para establecer clave.
    params = None
    if mode == 'invite' and settings.frontend_public_url:
        origin = settings.frontend_public_url.rstrip('/')
        if not (origin.startswith('https://') or (settings.environment == 'development' and
                                                 origin.startswith('http://127.0.0.1:'))):
            raise ProvisioningError(503, 'FRONTEND_PUBLIC_URL no es HTTPS válido')
        params = {'redirect_to': origin + '/establecer-clave'}
    try:
        response = httpx.post(base + path, headers=headers, json=body, params=params, timeout=15)
        if response.status_code >= 400:
            # Nunca devolver cuerpo crudo ni URL o cabeceras: pueden revelar tokens.
            if response.status_code in (400, 409, 422):
                raise ProvisioningError(409, 'Supabase rechazó el alta: correo existente o inválido')
            if response.status_code == 429:
                raise ProvisioningError(429, 'Límite temporal de invitaciones; inténtalo más tarde')
            raise ProvisioningError(502, 'Supabase Auth no pudo completar el alta')
        payload = response.json()
        # GoTrue /invite y /admin/users devuelven el usuario directamente.
        return UUID(payload['id'])
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        raise ProvisioningError(503, 'Supabase Auth no está disponible o devolvió una respuesta inválida') from None


def delete_created_identity(auth_id: UUID) -> bool:
    """Compensación tras fallo de la BD, sin mostrar secretos en logs.

    NO se invoca para identidades preexistentes ni para desactivar cuentas.
    """
    try:
        response = httpx.delete(
            settings.supabase_url.rstrip('/') + f'/auth/v1/admin/users/{auth_id}',
            headers=_admin_headers(), timeout=12,
        )
        return response.status_code in (200, 204, 404)
    except (httpx.HTTPError, ProvisioningError):
        return False
