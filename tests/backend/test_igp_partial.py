"""Regresión: una fila sin fecha no debe detener la ingesta de otras válidas."""

from datetime import datetime, timezone
from uuid import uuid4

import httpx
from sqlalchemy import create_engine, event, select
from sqlalchemy.pool import StaticPool

from app.db.tables import metadata, events, runs, sources
from app.igp.client import IGPQueryResult, normalize, query
from app.ingestion.igp import sync_igp


def _feature(code, day, clock, *, has_fallback=False):
    attrs = {
        "code": code, "fechaevento": day, "hora": clock,
        "lat": -12.5, "lon": -76.5, "magnitud": 4.0, "prof": 40,
        "ref": "Reporte observado",
    }
    if has_fallback:
        attrs["fecha"] = int(datetime(2026, 10, 22, 16, tzinfo=timezone.utc).timestamp() * 1000)
    return {"attributes": attrs}


def _client(features):
    return httpx.Client(transport=httpx.MockTransport(
        lambda _: httpx.Response(200, json={"features": features})
    ))


def _engine():
    db = create_engine(
        "sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    @event.listens_for(db, "connect")
    def configure(conn, _):
        conn.execute("ATTACH DATABASE ':memory:' AS public")
        conn.create_function("gen_random_uuid", 0, lambda: uuid4().hex)
    metadata.create_all(db, tables=[sources, runs, events])
    with db.begin() as conn:
        conn.exec_driver_sql("CREATE UNIQUE INDEX public.sources_name_uq ON data_sources(name)")
    return db


def test_missing_date_is_counted_but_valid_report_is_preserved():
    valid_ms = int(datetime(2026, 10, 23, 18, 38, 13, tzinfo=timezone.utc).timestamp() * 1000)
    features = [_feature("2026-0747", valid_ms, "13:38:13"),
                _feature("2026-0746", None, "23:25:24")]
    with _client(features) as client:
        batch = query("recent", limit=20, strict=False, client=client)
    assert isinstance(batch, IGPQueryResult)
    assert len(batch) == 1
    assert batch.total == 2
    assert len(batch.skipped) == 1
    assert "Fecha IGP inválida" in batch.skipped[0]

    db = _engine()
    try:
        first = sync_igp(engine=db, fetch=lambda _: batch)
        second = sync_igp(engine=db, fetch=lambda _: batch)
        assert (first.seen, first.processed, first.skipped, first.inserted) == (2, 1, 1, 1)
        assert first.status == "partial"
        assert (second.inserted, second.updated, second.unchanged) == (0, 0, 1)
        with db.connect() as conn:
            statuses = conn.execute(select(runs.c.status, runs.c.error_summary)).all()
            rows = conn.execute(select(events.c.external_id)).scalars().all()
        assert statuses[0][0] == statuses[1][0] == "partial"
        assert "2026-0746" in statuses[0][1]
        assert rows == ["2026-0747"]
    finally:
        db.dispose()


def test_fallback_date_works_when_fechaevento_is_absent():
    item = normalize(_feature("2026-0746", None, "11:25:24", has_fallback=True), "recent")
    assert item["occurred_at"] == "2026-10-22T16:25:24+00:00"


def test_bad_stable_code_is_skipped_if_other_records_valid():
    valid_ms = int(datetime(2026, 10, 23, 18, 38, 13, tzinfo=timezone.utc).timestamp() * 1000)
    features = [_feature("2026-0747", valid_ms, "13:38:13"),
                _feature("45", valid_ms, "13:38:13")]
    with _client(features) as client:
        batch = query("recent", strict=False, client=client)
    db = _engine()
    try:
        result = sync_igp(engine=db, fetch=lambda _: batch)
        assert (result.seen, result.processed, result.skipped, result.status) == (2, 1, 1, "partial")
    finally:
        db.dispose()
