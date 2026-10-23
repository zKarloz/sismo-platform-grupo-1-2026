"""API IGP de solo lectura con cache de corta duración y metadatos de frescura."""
from datetime import datetime, timezone
from threading import Lock
from time import monotonic

from fastapi import APIRouter, HTTPException

from app.igp.client import IGPFeedError, IGPUnavailable, query

router = APIRouter(prefix="/igp", tags=["IGP · reportes observados"])
_CACHE_TTL = 120  # segundos; evita saturar el servicio oficial ante visitas.
_cache: dict[str, tuple[float, dict]] = {}
_lock = Lock()


def read_feed(feed: str) -> dict:
    now = monotonic()
    with _lock:
        entry = _cache.get(feed)
        if entry and now - entry[0] < _CACHE_TTL:
            return entry[1]
    try:
        items = query(feed, limit=20 if feed == "recent" else 1)
    except (IGPUnavailable, IGPFeedError):
        raise HTTPException(status_code=503, detail="Fuente IGP temporalmente no disponible") from None
    fetched_at = datetime.now(timezone.utc)
    latest_at = datetime.fromisoformat(items[0]["occurred_at"]) if items else None
    age_hours = round((fetched_at - latest_at).total_seconds() / 3600, 1) if latest_at else None
    response = {
        "items": items,
        "source": "Instituto Geofísico del Perú (IGP/CENSIS)",
        "feed": feed,
        "fetched_at": fetched_at.isoformat(),
        "latest_event_at": latest_at.isoformat() if latest_at else None,
        "latest_age_hours": age_hours,
        "message": ("Sin reportes disponibles" if not items else
                    "Los reportes de la fuente no son recientes; revisar publicación del IGP" if age_hours is not None and age_hours > 24 else
                    "Consulta de reportes publicados; no es alerta temprana"),
        "refresh_interval_seconds": 300,
    }
    with _lock:
        _cache[feed] = (monotonic(), response)
    return response


@router.get("/recent")
def recent_reports() -> dict:
    """Hasta 20 reportes de la capa Sismos Reportados del IGP."""
    return read_feed("recent")


@router.get("/latest")
def latest_report() -> dict:
    """Consulta la capa independiente Último Sismo (si está publicada)."""
    return read_feed("latest")
