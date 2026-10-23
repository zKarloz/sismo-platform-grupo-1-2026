"""GeoJSON acotado para Leaflet, a partir de eventos almacenados."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_read_engine
from app.db.tables import events, sources
from app.routes.filters import SeismicFilters, get_filters

router = APIRouter(prefix="/events", tags=["Mapa sísmico"])
JOIN = events.join(sources, events.c.source_id == sources.c.id)


@router.get("/geojson")
def geojson(
    limit: int = Query(1000, ge=1, le=2000),
    filters: SeismicFilters = Depends(get_filters),
    engine: Engine = Depends(get_read_engine),
) -> dict:
    """Retorna registros recientes con longitud-latitud (orden GeoJSON).

    Nunca reportar cobertura completa si el límite de puntos se ha alcanzado.
    """
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(JOIN).where(*filters.conditions())).scalar_one()
            rows = conn.execute(
                select(events.c.id, events.c.external_id, events.c.occurred_at,
                       events.c.latitude, events.c.longitude, events.c.magnitude,
                       events.c.magnitude_type, events.c.depth_km, events.c.place,
                       events.c.source_url, sources.c.name.label("source_name"))
                .select_from(JOIN).where(*filters.conditions())
                .order_by(events.c.occurred_at.desc(), events.c.id.desc()).limit(limit)
            ).all()
    except SQLAlchemyError:
        raise HTTPException(503, "Mapa temporalmente no disponible") from None
    features = [
        {
            "type": "Feature", "id": str(row.id),
            "geometry": {"type": "Point", "coordinates": [row.longitude, row.latitude]},
            "properties": {"external_id": row.external_id, "occurred_at": row.occurred_at,
                           "magnitude": row.magnitude, "magnitude_type": row.magnitude_type,
                           "depth_km": row.depth_km, "place": row.place,
                           "source_url": row.source_url, "source_name": row.source_name},
        }
        for row in rows
    ]
    return {"type": "FeatureCollection", "features": features, "total": total,
            "returned": len(features), "truncated": total > len(features), "sample": "most_recent"}
