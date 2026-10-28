"""Catálogo de sismos reales; solo lectura hasta implementar roles (Fase 2)."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.engine import Engine

from app.db.session import get_read_engine
from app.db.tables import events, sources

router = APIRouter(prefix="/events", tags=["Eventos observados"])


def _event(row) -> dict:
    """Salida estable: fuente, tiempos, unidades y vínculo de procedencia."""
    return dict(row._mapping)


@router.get("")
def list_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    min_magnitude: float | None = Query(None, ge=-3, le=12),
    min_depth: float | None = Query(None, ge=0, le=900),
    max_depth: float | None = Query(None, ge=0, le=900),
    south: float | None = Query(None, ge=-90, le=90),
    west: float | None = Query(None, ge=-180, le=180),
    north: float | None = Query(None, ge=-90, le=90),
    east: float | None = Query(None, ge=-180, le=180),
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    source: str | None = Query(None, max_length=40),
    engine: Engine = Depends(get_read_engine),
) -> dict:
    """Paginación y filtros basados exclusivamente en datos persistidos."""
    if (start_time and start_time.tzinfo is None) or (end_time and end_time.tzinfo is None):
        raise HTTPException(status_code=422, detail="Las fechas necesitan zona horaria (ejemplo: +00:00)")
    if start_time and end_time and start_time > end_time:
        raise HTTPException(status_code=422, detail="Rango de fechas inválido")
    if min_depth is not None and max_depth is not None and min_depth > max_depth:
        raise HTTPException(status_code=422, detail="Rango de profundidad inválido")
    area = (south, west, north, east)
    if any(value is not None for value in area):
        if any(value is None for value in area) or south > north or west > east:
            raise HTTPException(status_code=422, detail="Zona incompleta o invertida")
    base = events.join(sources, events.c.source_id == sources.c.id)
    conditions = []
    if min_magnitude is not None:
        conditions.append(events.c.magnitude >= min_magnitude)
    if min_depth is not None:
        conditions.append(events.c.depth_km >= min_depth)
    if max_depth is not None:
        conditions.append(events.c.depth_km <= max_depth)
    if south is not None:
        conditions.extend((events.c.latitude >= south, events.c.latitude <= north,
                           events.c.longitude >= west, events.c.longitude <= east))
    if start_time is not None:
        conditions.append(events.c.occurred_at >= start_time)
    if end_time is not None:
        conditions.append(events.c.occurred_at <= end_time)
    if source:
        conditions.append(func.lower(sources.c.name) == source.lower())

    columns = [events, sources.c.name.label("source_name")]
    try:
        with engine.connect() as connection:
            total = connection.execute(
                select(func.count()).select_from(base).where(*conditions)
            ).scalar_one()
            results = connection.execute(
                select(*columns).select_from(base).where(*conditions)
                .order_by(events.c.occurred_at.desc(), events.c.id.desc())
                .offset((page - 1) * page_size).limit(page_size)
            ).all()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Catálogo temporalmente no disponible") from None
    return {"items": [_event(item) for item in results], "total": total,
            "page": page, "page_size": page_size}


@router.get("/{event_id}")
def event_detail(event_id: UUID, engine: Engine = Depends(get_read_engine)) -> dict:
    """Obtiene un evento por UUID interno con su procedencia original."""
    try:
        with engine.connect() as connection:
            result = connection.execute(
                select(events, sources.c.name.label("source_name"))
                .select_from(events.join(sources, events.c.source_id == sources.c.id))
                .where(events.c.id == event_id)
            ).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Catálogo temporalmente no disponible") from None
    if result is None:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return _event(result)
