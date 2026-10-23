"""Conexiones a Supabase PostgreSQL con pooling y configuración del monorepo."""

from functools import lru_cache

from fastapi import HTTPException
from sqlalchemy import Engine, create_engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Reutiliza el pool de conexiones; nunca registra DATABASE_URL."""
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL no está configurada")
    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=3,
        pool_recycle=1800,
        connect_args={"connect_timeout": 10},
    )


def get_read_engine() -> Engine:
    """Dependencia HTTP; permite sustituir la BD en pruebas."""
    try:
        return get_engine()
    except (RuntimeError, SQLAlchemyError):
        raise HTTPException(status_code=503, detail="Base de datos no disponible") from None
