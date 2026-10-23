"""Ingesta IGP: casos sin conexión de red ni escritura en Supabase real."""
from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import create_engine, select, event
from sqlalchemy.pool import StaticPool
from uuid import uuid4

from app.db.tables import metadata, events, sources, runs
from app.igp.client import IGPFeedError, query
from app.ingestion.igp import SOURCE_NAME, sync_igp


@pytest.fixture
def engine():
    db = create_engine(
        "sqlite+pysqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # SQLite requiere adjuntar el esquema `public` y simular gen_random_uuid().
    @event.listens_for(db, "connect")
    def attach_public(dbapi_conn, _):
        dbapi_conn.execute("ATTACH DATABASE ':memory:' AS public")
        dbapi_conn.create_function("gen_random_uuid", 0, lambda: uuid4().hex)

    metadata.create_all(db, tables=[sources, runs, events])
    # En PostgreSQL la unicidad proviene de la migración 001, no del Table Core.
    with db.begin() as conn:
        conn.exec_driver_sql("CREATE UNIQUE INDEX public.sources_name_uq ON data_sources(name)")
    try:
        yield db
    finally:
        db.dispose()


def record(code="2026-0747", magnitude=4.0, place="Andoas, Loreto"):
    return {
        "external_id": code,
        "occurred_at": "2026-10-23T18:38:13+00:00",
        "latitude": -2.68,
        "longitude": -77.23,
        "magnitude": magnitude,
        "magnitude_type": None,
        "depth_km": 141.0,
        "place": place,
        "source_url": "https://ultimosismo.igp.gob.pe/productos/reportes-sismicos",
    }


def test_first_run_second_run_idempotent_and_records_provenance(engine):
    first = sync_igp(engine=engine, fetch=lambda limit: [record("2026-747")])
    second = sync_igp(engine=engine, fetch=lambda limit: [record("2026-0747")])
    assert (first.seen, first.inserted, first.updated, first.unchanged) == (1, 1, 0, 0)
    assert (second.seen, second.inserted, second.updated, second.unchanged) == (1, 0, 0, 1)
    with engine.connect() as conn:
        rows = conn.execute(select(events)).mappings().all()
        logs = conn.execute(select(runs).order_by(runs.c.started_at)).mappings().all()
        registered = conn.execute(select(sources)).mappings().one()
    assert len(rows) == 1 and rows[0]["external_id"] == "2026-0747"
    assert rows[0]["occurred_at"].replace(tzinfo=timezone.utc) == datetime(2026, 10, 23, 18, 38, 13, tzinfo=timezone.utc)
    assert len(logs) == 2 and all(log["status"] == "success" for log in logs)
    assert registered["name"] == SOURCE_NAME


def test_revised_report_updated_only_when_different(engine):
    sync_igp(engine=engine, fetch=lambda _: [record(magnitude=4.0)])
    updated = sync_igp(engine=engine, fetch=lambda _: [record(magnitude=4.2)])
    assert (updated.inserted, updated.updated, updated.unchanged) == (0, 1, 0)
    unchanged = sync_igp(engine=engine, fetch=lambda _: [record(magnitude=4.2)])
    assert (unchanged.inserted, unchanged.updated, unchanged.unchanged) == (0, 0, 1)
    with engine.connect() as conn:
        assert conn.execute(select(events.c.magnitude)).scalar_one() == 4.2
        assert len(conn.execute(select(events.c.id)).all()) == 1


def test_failure_is_audited_without_inserting_partial_events(engine):
    def failing(_):
        raise IGPFeedError("Reporte malformado")
    with pytest.raises(IGPFeedError):
        sync_igp(engine=engine, fetch=failing)
    with engine.connect() as conn:
        logged = conn.execute(select(runs)).mappings().one()
        assert logged["status"] == "failed"
        assert "IGPFeedError" in logged["error_summary"]
        assert conn.execute(select(sources.c.status)).scalar_one() == "error"
        assert conn.execute(select(events)).all() == []


def test_missing_stable_code_fails_instead_of_objectid(engine):
    with pytest.raises(IGPFeedError):
        sync_igp(engine=engine, fetch=lambda _: [record(code="17")])
    with engine.connect() as conn:
        assert conn.execute(select(events)).all() == []
        assert conn.execute(select(runs.c.status)).scalar_one() == "failed"


def test_feed_empty_not_misreported_as_success(engine):
    with pytest.raises(IGPFeedError):
        sync_igp(engine=engine, fetch=lambda _: [])
    with engine.connect() as conn:
        assert conn.execute(select(runs.c.status)).scalar_one() == "failed"


def test_fetch_strict_mode_rejects_unknown_feature():
    response = {"features": [{"attributes": {"code": "2026-0747", "hora": "invalida"}}]}
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=response))) as client:
        with pytest.raises(IGPFeedError):
            query("recent", limit=200, strict=True, client=client)


def test_limit_rejects_invalid_values_without_database(engine):
    with pytest.raises(ValueError):
        sync_igp(limit=0, engine=engine)
    with pytest.raises(ValueError):
        sync_igp(limit=501, engine=engine)
