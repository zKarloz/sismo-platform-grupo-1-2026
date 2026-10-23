"""Endpoints para verificar el proceso API y la conexión a PostgreSQL."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings

router = APIRouter(tags=["Estado del servicio"])


@router.get("/health")
def api_health() -> dict[str, str]:
    """Comprobación liviana que NO requiere tener la base levantada."""
    return {"status": "ok", "service": "sismo-api", "version": "0.1.0"}


@router.get("/db/health")
def database_health() -> dict[str, str]:
    """Comprueba SELECT 1 sin mostrar credenciales ni detalles de conexión."""
    if not settings.database_url:
        raise HTTPException(status_code=503, detail="Base de datos sin configurar")

    try:
        engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args={"connect_timeout": 10})
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        finally:
            engine.dispose()
            
    except (SQLAlchemyError, OSError) as exc:
        import logging

        # Clasifica el error sin publicar las credenciales.
        msg = str(exc).lower()

        if "password authentication failed" in msg:
            reason = "AUTH_FAILED"
        elif "tenant or user not found" in msg:
            reason = "POOLER_USER_OR_HOST"
        elif "could not translate host" in msg or "getaddrinfo" in msg:
            reason = "DNS_ERROR"
        elif "timeout" in msg or "timed out" in msg:
            reason = "CONNECTION_TIMEOUT"
        elif "network is unreachable" in msg:
            reason = "NETWORK_UNREACHABLE"
        else:
            reason = "OTHER_DATABASE_ERROR"

        logging.getLogger(__name__).error(
            "Supabase connection failed: %s (%s)",
            reason,
            type(exc).__name__,
        )

        raise HTTPException(
            status_code=503,
            detail="Base de datos no disponible",
        ) from None

    return {"status": "ok", "database": "postgresql"}
