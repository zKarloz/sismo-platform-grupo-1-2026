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
    base = events.join(sources, events.c.source_id == sources.c.id)
    conditions = []
    if min_magnitude is not None:
        conditions.append(events.c.magnitude >= min_magnitude)
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
    """Obtiene un evento por UUID interno con su procedencia USGS."""
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
