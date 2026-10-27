"""Consultas de solo lectura del conector IGP/CENSIS y su historial operativo.

El trabajo de sincronización permanece en GitHub Actions: esta API nunca
lanza ingestas ni devuelve credenciales o configuración secreta.
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.db.tables import runs, sources

router = APIRouter(prefix="/sources", tags=["Fuentes de datos"])
IGP_SOURCE = "IGP/CENSIS"
RunStatus = Literal["running", "success", "partial", "failed"]


@router.get("")
def list_sources(engine: Engine = Depends(get_read_engine)) -> dict:
    """Solo el proveedor visible IGP; no modificar otras fuentes persistidas."""
    try:
        with engine.connect() as connection:
            source_rows = connection.execute(
                select(sources).where(sources.c.name == IGP_SOURCE)
            ).mappings().all()
            items = []
            for item in source_rows:
                row = dict(item)
                latest = connection.execute(
                    select(runs).where(runs.c.source_id == row["id"])
                    .order_by(runs.c.started_at.desc(), runs.c.id.desc()).limit(1)
                ).mappings().first()
                # No se exponen registros ni secretos de otros proveedores.
                row["last_run"] = {**latest, "error_summary": None} if latest else None
                items.append(row)
    except SQLAlchemyError:
        raise HTTPException(503, "Fuentes temporalmente no disponibles") from None
    return {"items": items}


@router.get("/igp/runs")
def igp_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(5, ge=5, le=20),
    status: RunStatus | None = None,
    _: Principal = Depends(require_user),
    engine: Engine = Depends(get_read_engine),
) -> dict:
    """Historial paginado real, visible únicamente para usuarios autenticados.

    Los errores registrados por el sincronizador no incluyen credenciales;
    estos detalles no se ofrecen en el endpoint público de conectores.
    """
    if page_size not in (5, 10, 20):
        raise HTTPException(422, "page_size debe ser 5, 10 o 20")
    try:
        with engine.connect() as conn:
            source_id = conn.execute(
                select(sources.c.id).where(sources.c.name == IGP_SOURCE)
            ).scalar_one_or_none()
            if source_id is None:
                return {"items": [], "total": 0, "page": 1, "pages": 1, "page_size": page_size}
            condition = [runs.c.source_id == source_id]
            if status is not None:
                condition.append(runs.c.status == status)
            total = conn.execute(
                select(func.count()).select_from(runs).where(*condition)
            ).scalar_one()
            pages = max(1, (total + page_size - 1) // page_size)
            actual_page = min(page, pages)
            records = conn.execute(
                select(runs).where(*condition)
                .order_by(runs.c.started_at.desc(), runs.c.id.desc())
                .limit(page_size).offset((actual_page - 1) * page_size)
            ).mappings().all()
    except SQLAlchemyError:
        raise HTTPException(503, "Historial de sincronización temporalmente no disponible") from None

    items = []
    for record in records:
        row = dict(record)
        start, end = row["started_at"], row["finished_at"]
        row["duration_seconds"] = round((end - start).total_seconds(), 2) if start and end else None
        items.append(row)
    return {"items": items, "total": total, "page": actual_page,
            "pages": pages, "page_size": page_size}
