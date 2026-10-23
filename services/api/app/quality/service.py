"""Congelación transaccional de datasets para experimentos retrospectivos.

No consume USGS: reutiliza únicamente eventos ya sincronizados en Supabase.
Las versiones y filas se guardan juntas o no se guardan (atomicidad).
"""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select, text
from sqlalchemy.engine import Engine

from app.db.tables import datasets, events, snapshot_rows, sources
from app.quality.report import content_sha256, quality_report, snapshot_record
from app.routes.filters import SeismicFilters

MAX_DATASET_ROWS = 5000


def create_dataset(engine: Engine, *, name: str, filters: SeismicFilters,
                   max_rows: int = 1000) -> dict:
    """Crea siguiente versión sin recortar silenciosamente los resultados.

    Se ejecuta únicamente desde CLI local/privilegiada; no desde rutas HTTP.
    """
    if not (3 <= len(name) <= 64 and all(c.isascii() and (c.isalnum() or c in '_-') for c in name)):
        raise ValueError("Nombre: 3–64 caracteres ASCII [A-Za-z0-9_-]")
    if not 1 <= max_rows <= MAX_DATASET_ROWS:
        raise ValueError(f"max_rows debe estar entre 1 y {MAX_DATASET_ROWS}")
    base = events.join(sources, events.c.source_id == sources.c.id)
    conditions = filters.conditions()
    with engine.begin() as conn:
        # Serializa versiones por nombre en PostgreSQL. SQLite solo se usa en pruebas.
        if conn.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:name))"), {"name": name})
        total = conn.execute(select(func.count()).select_from(base).where(*conditions)).scalar_one()
        if total == 0:
            raise ValueError("No hay eventos que cumplan los filtros; no se creó el dataset")
        if total > max_rows:
            raise ValueError(f"Hay {total} eventos: aumenta --max-rows (máximo 5000) o acota filtros. No se creó nada")
        # Orden estable ante magnitudes y fechas iguales: UUID como desempate.
        results = conn.execute(
            select(events, sources.c.name.label("source_name"))
            .select_from(base).where(*conditions)
            .order_by(events.c.occurred_at.asc(), events.c.id.asc())
        ).mappings().all()
        records = [snapshot_record(dict(row)) for row in results]
        if len(records) != total:
            raise ValueError("Los eventos cambiaron durante la captura; vuelve a ejecutar")
        report = quality_report(records)
        version = conn.execute(
            select(func.coalesce(func.max(datasets.c.version), 0) + 1).where(datasets.c.name == name)
        ).scalar_one()
        now = datetime.now(timezone.utc)
        ds_id = uuid4()
        spec = {
            "start_time": filters.start_time.isoformat() if filters.start_time else None,
            "end_time": filters.end_time.isoformat() if filters.end_time else None,
            "min_magnitude": filters.min_magnitude, "max_magnitude": filters.max_magnitude,
            "min_depth": filters.min_depth, "max_depth": filters.max_depth,
            "source": filters.source, "max_rows": max_rows,
            "order": "occurred_at ASC, id ASC", "source_table": "public.seismic_events",
            "capture_mode": "full_filtered_snapshot", "timezone": "UTC",
        }
        digest = content_sha256(records)
        conn.execute(datasets.insert().values(
            id=ds_id, name=name, version=version, query_spec=spec,
            period_start=filters.start_time, period_end=filters.end_time,
            row_count=total, quality_report=report, content_sha256=digest,
            created_at=now,
        ))
        conn.execute(snapshot_rows.insert(), [
            {"dataset_id": ds_id, "position": index, "event_id": row["id"], "record": record}
            for index, (row, record) in enumerate(zip(results, records), 1)
        ])
    return {"id": str(ds_id), "name": name, "version": version,
            "row_count": total, "content_sha256": digest, "quality_report": report}


def verify_dataset(engine: Engine, dataset_id: str) -> dict:
    """Recalcula la huella de la copia guardada, no la tabla de eventos actual."""
    from uuid import UUID
    target = UUID(dataset_id)
    with engine.connect() as conn:
        dataset = conn.execute(select(datasets).where(datasets.c.id == target)).mappings().first()
        if not dataset:
            raise ValueError("Dataset no encontrado")
        records = conn.execute(select(snapshot_rows.c.record).where(
            snapshot_rows.c.dataset_id == target).order_by(snapshot_rows.c.position)
        ).scalars().all()
    actual = content_sha256(records)
    return {"id": dataset_id, "row_count": len(records),
            "row_count_matches": len(records) == dataset["row_count"],
            "hash_matches": actual == dataset["content_sha256"],
            "sha256": actual}
