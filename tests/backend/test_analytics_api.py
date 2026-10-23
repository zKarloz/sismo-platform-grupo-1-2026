"""Pruebas de Fase 4 con datos de laboratorio en SQLite, sin tocar Supabase."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.pool import StaticPool

from app.db.session import get_read_engine
from app.db.tables import events, metadata, sources
from app.main import app


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @sa_event.listens_for(engine, "connect")
    def attach(dbapi, _):
        dbapi.execute("ATTACH DATABASE ':memory:' AS public")

    metadata.create_all(engine)
    sid = uuid4()
    base = dict(source_id=sid, magnitude_type="mwr", review_status="reviewed")
    with engine.begin() as conn:
        conn.execute(sources.insert().values(id=sid, name="USGS", organization="USGS", base_url="https://earthquake.usgs.gov", source_type="api", status="active"))
        for i, mag, depth, when, place in [
            (1, 2.6, 10, "2026-10-01T10:00:00+00:00", "Camaná"),
            (2, 4.2, 35, "2026-10-01T12:00:00+00:00", "Arequipa"),
            (3, 6.1, None, "2026-10-02T12:00:00+00:00", "Ica"),
            (4, None, 12, "2026-09-20T12:00:00+00:00", "=HYPERLINK(\"test\")"),
        ]:
            conn.execute(events.insert().values(
                **base, id=uuid4(), external_id=f"us{i}", occurred_at=datetime.fromisoformat(when),
                latitude=-15+i, longitude=-75-i, magnitude=mag, depth_km=depth, place=place,
                source_url=f"https://earthquake.usgs.gov/earthquakes/eventpage/us{i}",
            ))
    app.dependency_overrides[get_read_engine] = lambda: engine
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_summary_and_filters(client):
    summary = client.get("/api/v1/dashboard/summary").json()
    assert summary["total"] == 4
    assert summary["max_magnitude"] == 6.1
    assert summary["with_depth"] == 3
    assert summary["with_magnitude"] == 3
    assert client.get("/api/v1/dashboard/summary?min_magnitude=4").json()["total"] == 2
    assert client.get("/api/v1/dashboard/summary?source=IGP").json()["total"] == 0


def test_timeseries_and_histogram(client):
    daily = client.get("/api/v1/analytics/timeseries?interval=day").json()
    assert daily["total"] == 4
    assert next(x for x in daily["items"] if x["period"] == "2026-10-01")["count"] == 2
    monthly = client.get("/api/v1/analytics/timeseries?interval=month").json()
    assert monthly["items"] == [{"period": "2026-09", "count": 1}, {"period": "2026-10", "count": 3}]
    counts = {r["range"]: r["count"] for r in client.get("/api/v1/analytics/magnitudes").json()["items"]}
    assert counts["< 3"] == 1
    assert counts["4–4.9"] == 1
    assert counts["≥ 6"] == 1
    assert counts["Sin dato"] == 1


def test_geojson_and_limited_scatter(client):
    m = client.get("/api/v1/events/geojson?limit=1").json()
    assert m["type"] == "FeatureCollection"
    assert m["total"] == 4 and m["returned"] == 1 and m["truncated"]
    assert m["features"][0]["geometry"]["coordinates"] == [-78, -12]
    points = client.get("/api/v1/analytics/depth-vs-magnitude?limit=1").json()
    assert points["total"] == 2 and points["returned"] == 1 and points["truncated"]


def test_validations_and_csv(client):
    assert client.get("/api/v1/dashboard/summary?start_time=2026-10-01T00:00:00").status_code == 422
    assert client.get("/api/v1/dashboard/summary?min_magnitude=6&max_magnitude=3").status_code == 422
    assert client.get("/api/v1/events/geojson?limit=3000").status_code == 422
    response = client.get("/api/v1/analytics/export.csv")
    assert response.status_code == 200
    assert "fecha_utc" in response.text
    assert "'=HYPERLINK" in response.text
    assert "'-75" not in response.text  # Los negativos numéricos no son fórmulas.
    assert response.headers["x-export-total"] == "4"
