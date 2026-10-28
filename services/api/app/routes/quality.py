"""Endpoints de solo lectura para calidad y datasets inmutables.

Las operaciones de escritura se limitan al comando CLI hasta tener RBAC.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_read_engine
from app.db.tables import datasets, events, snapshot_rows, historical_snapshot_rows, sources
from app.routes.filters import SeismicFilters, get_filters
from app.quality.source import IGP_SOURCE
from app.quality.service import verify_dataset
from app.quality.historical import KIND
from app.quality.report import content_sha256

quality_router = APIRouter(prefix="/data-quality", tags=["Calidad de datos"])
datasets_router = APIRouter(prefix="/datasets", tags=["Datasets versionados"])
JOIN = events.join(sources, events.c.source_id == sources.c.id)
# El catálogo histórico USGS se conserva, pero nunca se presenta como dataset IGP.
# La fuente se comprueba tanto en la consulta de captura como en el informe congelado.
IGP_DATASET = and_(
    func.lower(datasets.c.query_spec["source"].as_string()) == IGP_SOURCE.casefold(),
    datasets.c.quality_report["by_source"][IGP_SOURCE].as_integer() == datasets.c.row_count,
)


def _require_igp_filter(filters: SeismicFilters) -> None:
    """Una petición source=USGS explícita no debe generar un informe engañoso."""
    if filters.source is not None and filters.source.casefold() != IGP_SOURCE.casefold():
        raise HTTPException(422, "La fuente permitida es IGP/CENSIS")



def _count_if(condition):
    # Compatible PostgreSQL y SQLite; devuelve cero en conjuntos vacíos.
    return func.sum(case((condition, 1), else_=0))


@quality_router.get("/summary")
def summary(filters: SeismicFilters = Depends(get_filters),
            engine: Engine = Depends(get_read_engine)) -> dict:
    """Conteos sobre TODOS los eventos filtrados, sin límite/muestra parcial."""
    _require_igp_filter(filters)
    future_limit = datetime.now(timezone.utc) + timedelta(minutes=5)
    null_fields = ("magnitude", "depth_km", "magnitude_type", "place", "source_updated_at")
    invalid = or_(
        events.c.latitude < -90, events.c.latitude > 90,
        events.c.longitude < -180, events.c.longitude > 180,
        events.c.magnitude < -3, events.c.magnitude > 12,
        events.c.depth_km < -20, events.c.depth_km > 1000,
        func.length(func.trim(events.c.external_id)) == 0,
    )
    fields = [func.count().label("total"),
              func.min(events.c.occurred_at).label("first_occurred_at"),
              func.max(events.c.occurred_at).label("last_occurred_at"),
              _count_if(invalid).label("out_of_range_or_invalid"),
              _count_if(events.c.occurred_at > future_limit).label("future_events"),
              _count_if(events.c.magnitude.is_not(None) & events.c.depth_km.is_not(None)).label("complete_magnitude_depth")]
    fields += [_count_if(events.c[name].is_(None)).label("missing_" + name) for name in null_fields]
    try:
        with engine.connect() as conn:
            row = conn.execute(select(*fields).select_from(JOIN).where(*filters.conditions(), func.lower(sources.c.name) == IGP_SOURCE.casefold())).mappings().one()
            by_source = conn.execute(
                select(sources.c.name, func.count().label("total")).select_from(JOIN)
                .where(*filters.conditions(), func.lower(sources.c.name) == IGP_SOURCE.casefold()).group_by(sources.c.name).order_by(sources.c.name)
            ).all()
    except SQLAlchemyError:
        raise HTTPException(503, "Calidad de datos temporalmente no disponible") from None
    missing = {key: int(row["missing_" + key] or 0) for key in null_fields}
    invalid_count, future_count = int(row["out_of_range_or_invalid"] or 0), int(row["future_events"] or 0)
    return {
        "checked_at": datetime.now(timezone.utc), "total": row["total"],
        "missing": missing, "duplicates_within_source": 0,
        "duplicate_check": "Restricción UNIQUE (source_id, external_id) activa en seismic_events",
        "out_of_range_or_invalid": invalid_count, "future_events": future_count,
        "complete_magnitude_depth": int(row["complete_magnitude_depth"] or 0),
        "min_occurred_at": row["first_occurred_at"], "max_occurred_at": row["last_occurred_at"],
        "by_source": {name: count for name, count in by_source},
        "status": "review" if invalid_count or future_count else ("missing_values" if any(missing.values()) else "ok"),
        "method": "Validaciones de integridad y completitud sobre todos los eventos filtrados; sin imputación.",
    }


@datasets_router.get("")
def list_datasets(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                  engine: Engine = Depends(get_read_engine)) -> dict:
    """Exponer solo metadatos; la creación requiere ejecutar el comando CLI."""
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(datasets).where(IGP_DATASET)).scalar_one()
            result = conn.execute(
                select(datasets.c.id, datasets.c.name, datasets.c.version,
                       datasets.c.row_count, datasets.c.content_sha256, datasets.c.created_at,
                       datasets.c.quality_report, datasets.c.query_spec)
                .where(IGP_DATASET)
                .order_by(datasets.c.created_at.desc(), datasets.c.id.desc())
                .offset((page - 1) * page_size).limit(page_size)
            ).mappings().all()
    except SQLAlchemyError:
        raise HTTPException(503, "Datasets temporalmente no disponibles; verifica migración 002") from None
    return {"items": [dict(row) for row in result], "total": total, "page": page, "page_size": page_size}


@datasets_router.get("/{dataset_id}/quality")
def dataset_quality(dataset_id: UUID, engine: Engine = Depends(get_read_engine)) -> dict:
    """Lee el informe de calidad congelado junto con su versión."""
    try:
        with engine.connect() as conn:
            row = conn.execute(select(datasets).where(datasets.c.id == dataset_id, IGP_DATASET)).mappings().first()
    except SQLAlchemyError:
        raise HTTPException(503, "Informe temporalmente no disponible") from None
    if row is None:
        raise HTTPException(404, "Dataset no encontrado")
    return {"id": row["id"], "name": row["name"], "version": row["version"],
            "row_count": row["row_count"], "content_sha256": row["content_sha256"],
            "query_spec": row["query_spec"], "created_at": row["created_at"],
            "quality_report": row["quality_report"]}


def _historical_partition_valid(record: dict) -> bool:
    """Proteger lecturas del conjunto 2025 y tratar filas alteradas como errores."""
    try:
        year = int(str(record.get("occurred_at", ""))[:4])
        return (2019 <= year <= 2024
                and record.get("split") == ("train" if year <= 2023 else "validation")
                and record.get("source_name") == IGP_SOURCE)
    except (TypeError, ValueError, AttributeError):
        return False


@datasets_router.get("/{dataset_id}/preview")
def dataset_preview(dataset_id: UUID, page: int = Query(1, ge=1),
                    page_size: int = Query(5, ge=1, le=20),
                    engine: Engine = Depends(get_read_engine)) -> dict:
    """Mostrar un subconjunto de filas inmutables sin mezclar fuentes.

    Para el histórico IGP, no se exponen eventos del año 2025 reservado.
    """
    fields = ("external_id", "occurred_at", "latitude", "longitude", "magnitude",
              "depth_km", "place", "source_name")
    try:
        with engine.connect() as conn:
            ds = conn.execute(select(datasets.c.id, datasets.c.row_count, datasets.c.query_spec)
                              .where(datasets.c.id == dataset_id, IGP_DATASET)).mappings().first()
            if ds is None:
                raise HTTPException(404, "Dataset IGP no encontrado")
            historical = ds["query_spec"].get("dataset_kind") == KIND
            table = historical_snapshot_rows if historical else snapshot_rows
            rows = conn.execute(select(table.c.position, table.c.record)
                                .where(table.c.dataset_id == dataset_id)
                                .order_by(table.c.position)
                                .offset((page - 1) * page_size).limit(page_size)).mappings().all()
    except SQLAlchemyError:
        raise HTTPException(503, "Vista previa temporalmente no disponible") from None
    items = []
    for row in rows:
        record = row["record"]
        if record.get("source_name") != IGP_SOURCE:
            raise HTTPException(409, "Procedencia del snapshot inconsistente")
        if historical and not _historical_partition_valid(record):
            raise HTTPException(409, "Partición histórica inconsistente")
        items.append({"position": row["position"], **{key: record.get(key) for key in fields},
                      **({"split": record.get("split")} if historical else {})})
    return {"items": items, "total": ds["row_count"], "page": page, "page_size": page_size}


@datasets_router.get("/{dataset_id}/integrity")
def dataset_integrity(dataset_id: UUID, engine: Engine = Depends(get_read_engine)) -> dict:
    """Verificar integridad, fuente y partición sobre el snapshot congelado."""
    try:
        with engine.connect() as conn:
            ds = conn.execute(select(datasets).where(datasets.c.id == dataset_id, IGP_DATASET)).mappings().first()
            if ds is None:
                raise HTTPException(404, "Dataset IGP no encontrado")
            historical = ds["query_spec"].get("dataset_kind") == KIND
            if historical:
                rows = conn.execute(select(historical_snapshot_rows.c.record)
                    .where(historical_snapshot_rows.c.dataset_id == dataset_id)
                    .order_by(historical_snapshot_rows.c.position)).scalars().all()
                expected_split = ds["quality_report"].get("by_split", {})
                split_valid = (
                    sum(r.get("split") == "train" for r in rows) == expected_split.get("train")
                    and sum(r.get("split") == "validation" for r in rows) == expected_split.get("validation")
                    and all(_historical_partition_valid(r) for r in rows)
                )
                actual_hash = content_sha256(rows)
                status = {"id": str(dataset_id), "row_count": len(rows),
                          "row_count_matches": len(rows) == ds["row_count"],
                          "hash_matches": actual_hash == ds["content_sha256"], "sha256": actual_hash}
            else:
                rows = conn.execute(select(snapshot_rows.c.record)
                    .where(snapshot_rows.c.dataset_id == dataset_id)
                    .order_by(snapshot_rows.c.position)).scalars().all()
                status = verify_dataset(engine, str(dataset_id))
                split_valid = True
    except SQLAlchemyError:
        raise HTTPException(503, "Verificación temporalmente no disponible") from None
    status["igp_only"] = all(r.get("source_name") == IGP_SOURCE for r in rows)
    status["split_valid"] = split_valid
    status["verified"] = bool(status["row_count_matches"] and status["hash_matches"]
                               and status["igp_only"] and split_valid)
    return status
