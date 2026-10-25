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
    # Solo servidor: URL y API key pública para validar tokens Supabase Auth.
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    # Clave privilegiada SOLO para FastAPI, jamás en variables VITE_* ni en Git.
    supabase_secret_key: str = ""
    # Solo desarrollo: habilita cuentas ficticias .test con contraseña temporal.
    allow_demo_user_creation: bool = False
    # Base HTTPS de Vercel para enlaces de invitación; solo configuración del servidor.
    frontend_public_url: str = ""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8", extra="ignore",
    )

settings = Settings()
