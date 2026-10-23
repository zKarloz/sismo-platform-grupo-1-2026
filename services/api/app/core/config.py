"""Configuración compartida: carga .env desde la raíz del monorepo."""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    """Los secretos nunca se registran en logs."""
    app_name: str = "Sistema de Monitoreo Sísmico V2"
    environment: str = "development"
    database_url: str | None = None
    # CORS_ORIGINS=https://mi-app.vercel.app; separar dominios adicionales por comas.
    cors_origins: str = ""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8", extra="ignore",
    )

settings = Settings()
