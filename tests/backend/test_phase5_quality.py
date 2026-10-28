"""Fase 5: pruebas aisladas en SQLite, sin acceso a Supabase ni USGS."""

from datetime import datetime, timezone, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event as sa_event, select
from sqlalchemy.pool import StaticPool

from app.db.session import get_read_engine
from app.db.tables import datasets, events, metadata, snapshot_rows, sources
from app.main import app
from app.quality.report import content_sha256, quality_report, snapshot_record
from app.quality.service import create_dataset, verify_dataset
from app.routes.filters import SeismicFilters


@pytest.fixture
def engine():
    db = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @sa_event.listens_for(db, "connect")
    def attach(dbapi, _):
        dbapi.execute("ATTACH DATABASE ':memory:' AS public")
    metadata.create_all(db)
    sid = uuid4()
    with db.begin() as conn:
        conn.execute(sources.insert().values(id=sid, name="IGP/CENSIS", organization="IGP/CENSIS",
                                            base_url="https://ultimosismo.igp.gob.pe", source_type="api", status="active"))
        for i, mag, depth in [(1, 4.2, 35), (2, None, 20), (3, 3.1, None)]:
            conn.execute(events.insert().values(
                id=uuid4(), source_id=sid, external_id=f"igp{i}", occurred_at=datetime(2026, 10, i, tzinfo=timezone.utc),
                latitude=-15 + i, longitude=-72, magnitude=mag, depth_km=depth, place="Perú",
                source_url=f"https://ultimosismo.igp.gob.pe/evento/igp{i}",
                review_status="reviewed", magnitude_type="mwr",
            ))
    yield db
    db.dispose()


@pytest.fixture
def client(engine):
    app.dependency_overrides[get_read_engine] = lambda: engine
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_report_handles_missing_and_duplicate_without_imputation():
    now = datetime(2026, 10, 20, tzinfo=timezone.utc)
    row = dict(id=str(uuid4()), source_id="usgs", external_id="event1", occurred_at=now.isoformat(),
               latitude=-16., longitude=-71., magnitude=None, depth_km=35., source_url="https://example.org", source_name="USGS")
    report = quality_report([row, dict(row)], checked_at=now)
    assert report["total"] == 2
    assert report["missing"]["magnitude"] == 2
    assert report["duplicates_within_source"] == 1
    assert report["complete_magnitude_depth"] == 0
    assert report["status"] == "review"
    assert row["magnitude"] is None


def test_future_and_out_of_range_are_flagged():
    now = datetime(2026, 10, 20, tzinfo=timezone.utc)
    row = {"id": "a", "source_id": "s", "source_name": "USGS", "external_id": "us1",
           "occurred_at": (now + timedelta(days=1)).isoformat(), "latitude": 999.,
           "longitude": -72., "magnitude": 4.0, "depth_km": 20., "source_url": "https://example.org"}
    report = quality_report([row], checked_at=now)
    assert report["future_events"] == 1
    assert report["out_of_range_or_invalid"] == 1


def test_live_quality_and_filter(client):
    report = client.get('/api/v1/data-quality/summary').json()
    assert report['total'] == 3
    assert report['missing']['magnitude'] == 1
    assert report['missing']['depth_km'] == 1
    assert report['complete_magnitude_depth'] == 1
    assert report['duplicates_within_source'] == 0
    assert report['by_source'] == {'IGP/CENSIS': 3}
    partial = client.get('/api/v1/data-quality/summary?min_magnitude=4').json()
    assert partial['total'] == 1
    assert client.get('/api/v1/data-quality/summary?start_time=2026-10-01T00:00:00').status_code == 422


def test_dataset_lifecycle_and_immutable_snapshot(engine, client):
    assert client.get('/api/v1/datasets').json()['total'] == 0
    result = create_dataset(engine, name='peru_igp', filters=SeismicFilters(source='IGP/CENSIS'), max_rows=3)
    assert result['version'] == 1 and result['row_count'] == 3
    assert result['quality_report']['missing']['magnitude'] == 1
    assert verify_dataset(engine, result['id'])['hash_matches']

    listing = client.get('/api/v1/datasets').json()
    assert listing['total'] == 1 and listing['items'][0]['version'] == 1
    assert listing['items'][0]['content_sha256'] == result['content_sha256']
    detail = client.get(f"/api/v1/datasets/{result['id']}/quality")
    assert detail.status_code == 200 and detail.json()['row_count'] == 3

    with engine.begin() as conn:
        event_id = conn.execute(select(events.c.id).where(events.c.external_id == 'igp1')).scalar_one()
        conn.execute(events.update().where(events.c.id == event_id).values(magnitude=5.3))
        frozen = conn.execute(select(snapshot_rows.c.record).where(snapshot_rows.c.event_id == event_id)).scalar_one()
    assert frozen['magnitude'] == 4.2  # revisión de origen no altera v1
    assert verify_dataset(engine, result['id'])['hash_matches']
    next_version = create_dataset(engine, name='peru_igp', filters=SeismicFilters(), max_rows=3)
    assert next_version['version'] == 2 and next_version['content_sha256'] != result['content_sha256']
    assert client.get('/api/v1/datasets').json()['total'] == 2
    assert client.get('/api/v1/datasets/00000000-0000-0000-0000-000000000000/quality').status_code == 404
    assert client.post('/api/v1/datasets').status_code == 405  # no escritura pública


def test_dataset_refuses_truncation_and_empty_and_bad_inputs(engine, client):
    with pytest.raises(ValueError, match='aumenta --max-rows'):
        create_dataset(engine, name='peru_igp', filters=SeismicFilters(), max_rows=2)
    assert client.get('/api/v1/datasets').json()['total'] == 0
    with pytest.raises(ValueError, match='No hay eventos'):
        create_dataset(engine, name='peru_igp', filters=SeismicFilters(min_magnitude=11))
    with pytest.raises(ValueError, match='IGP/CENSIS'):
        create_dataset(engine, name='peru_igp', filters=SeismicFilters(source='USGS'))
    with pytest.raises(ValueError, match='Nombre'):
        create_dataset(engine, name='nombre con espacios', filters=SeismicFilters())
    with pytest.raises(ValueError, match='max_rows'):
        create_dataset(engine, name='dataset', filters=SeismicFilters(), max_rows=5001)


def test_hash_reproduces_and_detects_tamper(engine):
    result = create_dataset(engine, name='peru_igp', filters=SeismicFilters())
    assert verify_dataset(engine, result['id'])['hash_matches']
    # Solo prueba de manipulación en SQLite, donde no está el trigger de PG.
    with engine.begin() as conn:
        first = conn.execute(select(snapshot_rows).order_by(snapshot_rows.c.position)).mappings().first()
        changed = dict(first['record'])
        changed['magnitude'] = 8.0
        conn.execute(snapshot_rows.update().where(
            snapshot_rows.c.dataset_id == first['dataset_id'],
            snapshot_rows.c.position == first['position'],
        ).values(record=changed))
    assert not verify_dataset(engine, result['id'])['hash_matches']
