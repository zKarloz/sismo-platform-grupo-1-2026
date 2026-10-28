"""Pruebas de las rutas HTTP con SQLAlchemy + SQLite aislado (sin Supabase)."""

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
def db_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    # SQLite no tiene esquema 'public' por defecto. Lo adjuntamos solo al test.
    @sa_event.listens_for(engine, "connect")
    def attach_public(dbapi_connection, _):
        dbapi_connection.execute("ATTACH DATABASE ':memory:' AS public")

    metadata.create_all(engine)
    source_id = uuid4()
    event_id = uuid4()
    at = datetime(2026, 10, 22, 18, tzinfo=timezone.utc)
    with engine.begin() as conn:
        conn.execute(sources.insert().values(
            id=source_id, name="USGS", organization="USGS", base_url="https://earthquake.usgs.gov",
            source_type="api", status="active", sync_interval_minutes=5,
            last_sync_at=at, last_success_at=at,
        ))
        conn.execute(events.insert().values(
            id=event_id, source_id=source_id, external_id="us123", occurred_at=at,
            latitude=-12.1, longitude=-77.1, magnitude=4.3, magnitude_type="mb",
            depth_km=25.0, place="Perú (prueba)",
            source_url="https://earthquake.usgs.gov/earthquakes/eventpage/us123",
            review_status="reviewed", source_updated_at=at, received_at=at,
        ))
    app.dependency_overrides[get_read_engine] = lambda: engine
    try:
        yield TestClient(app), event_id
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_paginated_list_and_filter(db_client):
    client, _ = db_client
    response = client.get("/api/v1/events?page=1&page_size=10&min_magnitude=4")
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["source_name"] == "USGS"
    assert response.json()["items"][0]["magnitude_type"] == "mb"
    assert client.get("/api/v1/events?min_magnitude=6").json()["total"] == 0


def test_event_detail_and_404(db_client):
    client, event_id = db_client
    assert client.get(f"/api/v1/events/{event_id}").status_code == 200
    assert client.get(f"/api/v1/events/{uuid4()}").status_code == 404


def test_sources_and_invalid_date(db_client):
    client, _ = db_client
    source_response = client.get("/api/v1/sources")
    assert source_response.status_code == 200
    # El fixture solo contiene USGS, que debe permanecer oculto.
    assert source_response.json()["items"] == []
    assert client.get("/api/v1/events?start_time=2026-10-01T10:00:00").status_code == 422
