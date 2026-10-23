"""Ingesta IGP/CENSIS en Supabase, idempotente y separada del API web.

- Solo reportes observados y publicados en la capa «Sismos Reportados».
- No realiza alertas ni entrena modelos; no toca datasets ni ml_experiments.
- Las revisiones sin timestamp de fuente se comparan por valores (IS DISTINCT FROM).
- Usa un identificador estable del reporte IGP, nunca OBJECTID de ArcGIS.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.db.session import get_engine
from app.db.tables import events, runs, sources
from app.igp.client import IGPFeedError, IGPUnavailable, IGP_REPORTS, query
from app.ingestion.service import SyncResult

SOURCE_NAME = "IGP/CENSIS"


@dataclass(frozen=True)
class IGPSyncResult(SyncResult):
    """Mantiene la interfaz SyncResult e informa descartes de calidad."""
    skipped: int = 0
    processed: int = 0
# Los reportes públicos poseen códigos año-correlativo (p. ej. 2026-0747).
_REPORT_CODE = re.compile(r"^(\d{4})-(\d{1,6})$")


def _stable_code(value: str) -> str:
    """Evita IDs inestables OBJECTID y normaliza ceros del código publicado."""
    match = _REPORT_CODE.fullmatch(str(value).strip())
    if not match:
        raise IGPFeedError("El reporte IGP no tiene un código año-correlativo estable")
    return f"{match.group(1)}-{int(match.group(2)):04d}"


def _insert_for(engine, table):
    """PostgreSQL en producción, SQLite únicamente para pruebas aisladas."""
    if engine.dialect.name == "postgresql":
        return postgres_insert(table)
    if engine.dialect.name == "sqlite":
        return sqlite_insert(table)
    raise RuntimeError("Motor de base de datos no soportado para ingesta")


def sync_igp(*, limit: int = 200, engine=None, fetch=None) -> IGPSyncResult:
    """Sincroniza una ventana de reportes recientes y registra el resultado.

    Ejecutar como comando CLI en Render Cron; no desde una ruta HTTP pública.
    Una ventana fija de 200 no es un backfill histórico completo: puede dejar
    fuera reportes si la fuente lleva mucho tiempo sin consultarse.
    """
    if not 1 <= limit <= 500:
        raise ValueError("--limit debe estar entre 1 y 500")
    engine = engine if engine is not None else get_engine()
    # Una fila incompleta no bloquea todas las válidas. query conserva el motivo
    # y sync_igp marca la ejecución como «partial» cuando existen descartes.
    fetch = fetch if fetch is not None else (lambda amount: query("recent", limit=amount, strict=False))

    with engine.begin() as connection:
        insertion = _insert_for(engine, sources).values(
            name=SOURCE_NAME,
            organization="Instituto Geofísico del Perú - CENSIS",
            base_url=IGP_REPORTS,
            source_type="api",
            status="planned",
            sync_interval_minutes=5,
            license_notes=(
                "Fuente IGP/CENSIS, reportes observados. Atribuir al IGP; "
                "verificar términos de reutilización antes de publicación comercial."
            ),
        )
        connection.execute(insertion.on_conflict_do_nothing(index_elements=[sources.c.name]))
        source_id = connection.execute(
            select(sources.c.id).where(sources.c.name == SOURCE_NAME)
        ).scalar_one()
        run_id = connection.execute(
            runs.insert().values(source_id=source_id, status="running").returning(runs.c.id)
        ).scalar_one()

    try:
        received = fetch(limit)
        if not isinstance(received, list) or not received:
            raise IGPFeedError("No hay reportes válidos; se requiere revisar la fuente")

        # Las filas inválidas se descartan sin inventar fechas o IDs; el estado
        # del lote será «partial», nunca «success» si se perdió una fila.
        total = int(getattr(received, "total", len(received)))
        skipped_details = list(getattr(received, "skipped", []))
        unique: dict[str, dict] = {}
        for record in received:
            try:
                code = _stable_code(record["external_id"])
                occurred_at = datetime.fromisoformat(record["occurred_at"])
                if occurred_at.tzinfo is None:
                    raise IGPFeedError("Fecha de evento IGP sin zona horaria")
            except (IGPFeedError, KeyError, TypeError, ValueError) as exc:
                skipped_details.append(f"Código/fecha inválidos: {type(exc).__name__}")
                continue
            unique[code] = {
                "source_id": source_id,
                "external_id": code,
                "occurred_at": occurred_at.astimezone(timezone.utc),
                "latitude": record["latitude"],
                "longitude": record["longitude"],
                "magnitude": record["magnitude"],
                "magnitude_type": record.get("magnitude_type"),
                "depth_km": record.get("depth_km"),
                "place": record.get("place"),
                "source_url": record["source_url"],
                "review_status": "unreviewed",  # No atribuir revisión científica no verificada.
            }

        if not unique:
            raise IGPFeedError("No hay reportes con fecha y código válidos para almacenar")
        skipped_count = len(skipped_details)
        status = "partial" if skipped_count else "success"
        summary = None
        if skipped_count:
            # Resumen limitado: mensajes de validación, nunca datos privados.
            examples = "; ".join(skipped_details[:3])
            summary = f"Omitidos {skipped_count}/{total} reportes: {examples}"[:350]
        inserted, updated_count = _persist(
            engine, source_id, run_id, list(unique.values()),
            seen=total, status=status, warning=summary,
        )
        return IGPSyncResult(
            run_id=run_id, seen=total, inserted=inserted,
            updated=updated_count,
            unchanged=len(unique) - inserted - updated_count,
            status=status, skipped=skipped_count, processed=len(unique),
        )
    except Exception as exc:
        # No incluir traceback, SQL, tokens o DATABASE_URL en error_summary.
        if isinstance(exc, (IGPFeedError, IGPUnavailable, ValueError, KeyError)):
            summary = f"{type(exc).__name__}: {str(exc)[:240]}"
        else:
            summary = f"{type(exc).__name__}: error interno de sincronización"
        now = datetime.now(timezone.utc)
        with engine.begin() as connection:
            connection.execute(update(runs).where(runs.c.id == run_id).values(
                status="failed", finished_at=now, error_summary=summary,
            ))
            connection.execute(update(sources).where(sources.c.id == source_id).values(
                status="error", last_sync_at=now, updated_at=now,
            ))
        raise


def _persist(
    engine, source_id: UUID, run_id: UUID, records: list[dict],
    *, seen: int, status: str = "success", warning: str | None = None,
) -> tuple[int, int]:
    """Actualiza solo cambios observados, conserva IDs internos y snapshots ML."""
    with engine.begin() as connection:
        # Evita dobles carreras entre una ejecución manual y el cron de Render.
        if engine.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(20261023, 7)"))
        codes = [row["external_id"] for row in records]
        existing_ids = set()
        for offset in range(0, len(codes), 500):
            found = connection.execute(
                select(events.c.external_id).where(and_(
                    events.c.source_id == source_id,
                    events.c.external_id.in_(codes[offset:offset + 500]),
                ))
            ).scalars().all()
            existing_ids.update(found)

        inserted = 0
        revised = 0
        now = datetime.now(timezone.utc)
        mutable = (
            "occurred_at", "latitude", "longitude", "magnitude", "magnitude_type",
            "depth_km", "place", "source_url",
        )
        for offset in range(0, len(records), 100):
            batch = records[offset:offset + 100]
            stmt = _insert_for(engine, events).values(batch)
            # IGP no expone updated_at del registro de origen. Si los campos
            # coinciden exactamente, NO hacemos update ni cambiamos updated_at.
            changes = {name: getattr(stmt.excluded, name) for name in mutable}
            changes["updated_at"] = now
            changed = connection.execute(
                stmt.on_conflict_do_update(
                    index_elements=[events.c.source_id, events.c.external_id],
                    set_=changes,
                    where=or_(*[
                        getattr(events.c, name).is_distinct_from(getattr(stmt.excluded, name))
                        for name in mutable
                    ]),
                ).returning(events.c.external_id)
            ).scalars().all()
            inserted += sum(code not in existing_ids for code in changed)
            revised += sum(code in existing_ids for code in changed)

        connection.execute(update(runs).where(runs.c.id == run_id).values(
            status=status, finished_at=now, records_seen=seen,
            records_inserted=inserted, records_updated=revised,
            error_summary=warning,
        ))
        connection.execute(update(sources).where(sources.c.id == source_id).values(
            status="active", last_sync_at=now, updated_at=now,
            **({"last_success_at": now} if status == "success" else {}),
        ))
    return inserted, revised
