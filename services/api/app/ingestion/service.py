"""Persistencia idempotente de eventos USGS y bitácora de sincronizaciones."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.session import get_engine
from app.db.tables import events, runs, sources
from app.ingestion.usgs import USGSDataError, USGSRequestError, USGSEvent, USGS_QUERY_URL, fetch_usgs_events


@dataclass(frozen=True)
class SyncResult:
    run_id: UUID
    seen: int
    inserted: int
    updated: int
    unchanged: int
    status: str


def sync_usgs(days: int = 7, min_magnitude: float = 2.5) -> SyncResult:
    """Sincronización reciente de Fase 3 (interfaz pública del comando existente)."""
    if not 1 <= days <= 90:
        raise ValueError("--days debe estar entre 1 y 90")
    end = datetime.now(timezone.utc)
    return sync_usgs_range(end - timedelta(days=days), end, min_magnitude)


def sync_usgs_range(start: datetime, end: datetime, min_magnitude: float = 2.5) -> SyncResult:
    """Bloque temporal para backfill: conserva historial y deduplicación existente."""
    if start.tzinfo is None or end.tzinfo is None or start >= end:
        raise ValueError("Fechas UTC inválidas")
    if end - start > timedelta(days=90):
        raise ValueError("Los bloques no pueden exceder 90 días")
    if not -3 <= min_magnitude <= 12:
        raise ValueError("--min-magnitude fuera de rango")

    engine = get_engine()
    # Creamos o recuperamos el proveedor mediante nombre único, sin alterar
    # configuraciones administrativas preexistentes.
    with engine.begin() as connection:
        connection.execute(pg_insert(sources).values(
            name="USGS", organization="United States Geological Survey",
            base_url=USGS_QUERY_URL, source_type="api", status="planned",
            sync_interval_minutes=5,
            license_notes="Verificar políticas y atribución vigentes de USGS antes del uso público.",
        ).on_conflict_do_nothing(index_elements=[sources.c.name]))
        source_id = connection.execute(
            select(sources.c.id).where(sources.c.name == "USGS")
        ).scalar_one()
        run_id = connection.execute(
            runs.insert().values(source_id=source_id, status="running")
            .returning(runs.c.id)
        ).scalar_one()

    try:
        found = fetch_usgs_events(start, end, min_magnitude)
        inserted, updated_count = _write_events(engine, source_id, run_id, found)
        return SyncResult(
            run_id=run_id, seen=len(found), inserted=inserted,
            updated=updated_count, unchanged=len(found) - inserted - updated_count,
            status="success",
        )
    except Exception as exc:
        # Mensaje controlado: evitar volcados SQL o URLs de conexión con secretos.
        if isinstance(exc, (USGSDataError, USGSRequestError, ValueError)):
            description = f"{type(exc).__name__}: {str(exc)[:350]}"
        else:
            description = f"{type(exc).__name__}: fallo interno de sincronización"
        with engine.begin() as connection:
            connection.execute(update(runs).where(runs.c.id == run_id).values(
                status="failed", finished_at=datetime.now(timezone.utc),
                error_summary=description,
            ))
            connection.execute(update(sources).where(sources.c.id == source_id).values(
                status="error", last_sync_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            ))
        raise


def _write_events(engine, source_id: UUID, run_id: UUID, found: list[USGSEvent]) -> tuple[int, int]:
    """Una sola transacción: idempotencia, conteos correctos y bloqueo de carrera."""
    seen_ids = [event.external_id for event in found]
    with engine.begin() as connection:
        # Solo una escritura USGS a la vez. El lock dura toda esta transacción.
        connection.execute(text("SELECT pg_advisory_xact_lock(20261022, 3)"))
        stored: dict[str, datetime | None] = {}
        for offset in range(0, len(seen_ids), 800):
            chunk = seen_ids[offset : offset + 800]
            rows = connection.execute(select(
                events.c.external_id, events.c.source_updated_at,
            ).where(and_(events.c.source_id == source_id, events.c.external_id.in_(chunk)))).all()
            stored.update({row.external_id: row.source_updated_at for row in rows})

        inserted = 0
        updated_count = 0
        now = datetime.now(timezone.utc)
        # Enviar lotes de hasta 100 eventos reduce viajes a Supabase.
        # RETURNING devuelve solo inserciones o revisiones realmente aplicadas.
        for index in range(0, len(found), 100):
            batch = found[index : index + 100]
            values = [dict(
                source_id=source_id, external_id=record.external_id,
                occurred_at=record.occurred_at, latitude=record.latitude,
                longitude=record.longitude, magnitude=record.magnitude,
                magnitude_type=record.magnitude_type, depth_km=record.depth_km,
                place=record.place, source_url=record.source_url,
                source_updated_at=record.source_updated_at,
                review_status=record.review_status,
            ) for record in batch]
            statement = pg_insert(events).values(values)
            changes = {
                key: getattr(statement.excluded, key)
                for key in (
                    "occurred_at", "latitude", "longitude", "magnitude", "magnitude_type",
                    "depth_km", "place", "source_url", "source_updated_at", "review_status",
                )
            }
            changes["updated_at"] = now
            statement = statement.on_conflict_do_update(
                constraint="seismic_events_source_external_uq",
                set_=changes,
                where=and_(
                    statement.excluded.source_updated_at.is_not(None),
                    or_(
                        events.c.source_updated_at.is_(None),
                        statement.excluded.source_updated_at > events.c.source_updated_at,
                    ),
                ),
            ).returning(events.c.external_id)
            changed_ids = connection.execute(statement).scalars().all()
            inserted += sum(1 for external_id in changed_ids if external_id not in stored)
            updated_count += sum(1 for external_id in changed_ids if external_id in stored)

        connection.execute(update(runs).where(runs.c.id == run_id).values(
            status="success", finished_at=now,
            records_seen=len(found), records_inserted=inserted,
            records_updated=updated_count,
        ))
        connection.execute(update(sources).where(sources.c.id == source_id).values(
            status="active", last_sync_at=now, last_success_at=now, updated_at=now,
        ))
    return inserted, updated_count
