"""API FastAPI: eventos reales, fuentes y comprobaciones técnicas."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes.events import router as events_router
from app.routes.geo import router as geo_router
from app.routes.analytics import analytics_router, dashboard_router
from app.routes.exports import router as exports_router
from app.routes.health import router as health_router
from app.routes.sources import router as sources_router
from app.routes.quality import quality_router, datasets_router
from app.routes.ml import router as ml_router
from app.routes.igp import router as igp_router

app = FastAPI(
    title=settings.app_name,
    version="0.7.0",
    description="Consulta de sismos ocurridos; sin predicción ni alertas oficiales.",
)

# La URL de Vercel se habilitará explícitamente al desplegar, nunca '*'.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   *[origin.strip() for origin in settings.cors_origins.split(",")
                     if origin.strip() and origin.strip() != "*"]],
    allow_credentials=False,
    # Authorization Bearer en SPA; sin cookies compartidas ni wildcard de origen.
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(health_router, prefix="/api/v1")
app.include_router(geo_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(exports_router, prefix="/api/v1")
app.include_router(sources_router, prefix="/api/v1")

# Fase 5: consulta pública sin escritura hasta implementar autenticación y roles.
app.include_router(quality_router, prefix="/api/v1")
app.include_router(datasets_router, prefix="/api/v1")

# Fase 6: métricas únicamente; entrenamiento privado por terminal.
app.include_router(ml_router, prefix="/api/v1")

# Consulta directa IGP de solo lectura; sin credenciales ni escrituras.
app.include_router(igp_router, prefix="/api/v1")

# Fase 7: lectura pública de avisos informativos; ningún endpoint de escritura.
from app.routes.alerts import router as alerts_router
app.include_router(alerts_router, prefix="/api/v1")

# Fase 2: sesiones Supabase Auth, RBAC y auditoría en endpoints administrativos.
from app.routes.identity import router as identity_router
from app.routes.alert_admin import router as alert_admin_router
app.include_router(identity_router, prefix="/api/v1")
app.include_router(alert_admin_router, prefix="/api/v1")

# Fase 7: preferencias individuales autenticadas, sin endpoints de envío público.
from app.routes.personal_notifications import router as personal_notifications_router
app.include_router(personal_notifications_router, prefix="/api/v1")
