"""Estado público de conectores; sin métodos para forzar sincronizaciones."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_read_engine
from app.db.tables import runs, sources

router = APIRouter(prefix="/sources", tags=["Fuentes de datos"])


@router.get("")
def list_sources(engine: Engine = Depends(get_read_engine)) -> dict:
    """Presenta fuentes, fecha del último éxito y métricas de su ejecución."""
    try:
        with engine.connect() as connection:
            source_rows = connection.execute(select(sources).order_by(sources.c.name)).all()
            result = []
            for source_row in source_rows:
                item = dict(source_row._mapping)
                latest = connection.execute(
                    select(runs).where(runs.c.source_id == item["id"])
                    .order_by(runs.c.started_at.desc()).limit(1)
                ).first()
                item["last_run"] = dict(latest._mapping) if latest else None
                result.append(item)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Fuentes temporalmente no disponibles") from None
    return {"items": result}
