"""Regresiones de filtros reales del catálogo de eventos, sin Supabase externo."""
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event as sql_event
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import get_read_engine
from app.db.tables import metadata, sources, events


@pytest.fixture
def client():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)

    @sql_event.listens_for(engine, 'connect')
    def attach(connection, _):
        connection.execute("ATTACH DATABASE ':memory:' AS public")

    metadata.create_all(engine)
    igp, usgs = uuid4(), uuid4()
    at = datetime(2026, 10, 22, 18, 30, tzinfo=timezone.utc)
    with engine.begin() as conn:
        for identifier, name in ((igp, 'IGP/CENSIS'), (usgs, 'USGS')):
            conn.execute(sources.insert().values(id=identifier, name=name, organization=name,
                base_url='https://example.test', source_type='api', status='active'))
        for identifier, source_id, magnitude, depth, lat, lon in (
            ('2026-1234', igp, 4.2, 25.0, -12.1, -77.1),
            ('2026-1235', igp, 5.0, 110.0, -10.0, -76.0),
            ('us123', usgs, 6.0, 30.0, -11.0, -76.5),
        ):
            conn.execute(events.insert().values(id=uuid4(), source_id=source_id,
                external_id=identifier, occurred_at=at, latitude=lat, longitude=lon,
                magnitude=magnitude, depth_km=depth, source_url='https://example.test', review_status='reviewed'))
    app.dependency_overrides[get_read_engine] = lambda: engine
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_depth_and_geographic_area_use_database_filters(client):
    base = '/api/v1/events?source=IGP%2FCENSIS&page=1&page_size=5'
    first = client.get(base + '&max_depth=30&south=-13&north=-11&west=-78&east=-77')
    assert first.status_code == 200, first.text
    assert [row['external_id'] for row in first.json()['items']] == ['2026-1234']
    second = client.get(base + '&min_depth=100')
    assert [row['external_id'] for row in second.json()['items']] == ['2026-1235']
    # La interfaz siempre solicita IGP/CENSIS, no combina proveedores.
    assert client.get(base).json()['total'] == 2


@pytest.mark.parametrize('params', [
    {'min_depth': 50, 'max_depth': 20},
    {'south': -13},
    {'south': -10, 'north': -13, 'west': -78, 'east': -76},
    {'south': -13, 'north': -10, 'west': -75, 'east': -78},
])
def test_invalid_depth_or_geography_returns_422(client, params):
    result = client.get('/api/v1/events', params=params)
    assert result.status_code == 422
