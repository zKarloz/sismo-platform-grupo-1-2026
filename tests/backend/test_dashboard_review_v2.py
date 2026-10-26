"""Pruebas del Dashboard ejecutivo sobre SQLite aislado; nunca usa Supabase."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event as sql_event
from sqlalchemy.pool import StaticPool

from app.db.session import get_read_engine
from app.db.tables import alert_rules, alerts, events, metadata, runs, sources
from app.routes.analytics import analytics_router, dashboard_router
from app.routes.geo import router as geo_router


@pytest.fixture
def client():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)

    @sql_event.listens_for(engine, 'connect')
    def _attach(dbapi, _):
        dbapi.execute("ATTACH DATABASE ':memory:' AS public")

    metadata.create_all(engine)
    igp_id, usgs_id = uuid4(), uuid4()
    date = datetime(2026, 10, 25, tzinfo=timezone.utc)
    with engine.begin() as conn:
        for sid, name in ((igp_id, 'IGP/CENSIS'), (usgs_id, 'USGS')):
            conn.execute(sources.insert().values(
                id=sid, name=name, organization=name, base_url='https://example.org',
                source_type='api', status='active', last_success_at=date,
            ))
        # Tres IGP con profundidades 10, 12, 30; un USGS para detectar mezcla.
        igp_event_id = None
        for i, (sid, depth, lat) in enumerate(((igp_id, 10, -12), (igp_id, 12, -14),
                                               (igp_id, 30, -16), (usgs_id, 900, -5))):
            event_id = uuid4()
            if i == 0:
                igp_event_id = event_id
            conn.execute(events.insert().values(
                id=event_id, source_id=sid, external_id=f'ev{i}', occurred_at=date,
                received_at=date + timedelta(minutes=12), latitude=lat, longitude=-75,
                magnitude=4.2, source_url='https://example.org/event', depth_km=depth,
                review_status='reviewed',
            ))
        conn.execute(runs.insert().values(
            id=uuid4(), source_id=igp_id, started_at=date,
            finished_at=date + timedelta(seconds=14), status='success',
            records_seen=3, records_inserted=3, records_updated=0,
        ))
        rule_id = uuid4()
        conn.execute(alert_rules.insert().values(
            id=rule_id, name='Regla de prueba IGP', source_id=igp_id,
            min_magnitude=4, zone_spec={}, severity='info', channel='in_app',
            enabled=True, requires_approval=False, cooldown_seconds=600,
        ))
        conn.execute(alerts.insert().values(
            id=uuid4(), event_id=igp_event_id, rule_id=rule_id,
            title='Aviso posterior', message='Dato observado', severity='info',
            status='pending', source_url='https://example.org/event',
        ))

    app = FastAPI()
    app.include_router(dashboard_router, prefix='/api/v1')
    app.include_router(analytics_router, prefix='/api/v1')
    app.include_router(geo_router, prefix='/api/v1')
    app.dependency_overrides[get_read_engine] = lambda: engine
    try:
        yield TestClient(app)
    finally:
        engine.dispose()


def test_median_and_exclusive_igp(client):
    data = client.get('/api/v1/dashboard/summary?source=IGP%2FCENSIS').json()
    assert data['total'] == 3
    assert data['avg_depth_km'] == 17.3
    assert data['median_depth_km'] == 12.0
    even = client.get('/api/v1/dashboard/summary?source=IGP%2FCENSIS&min_lat=-15&max_lat=-10&min_lon=-76&max_lon=-74').json()
    assert even['total'] == 2 and even['median_depth_km'] == 11.0


def test_identical_geo_filters_for_kpi_graph_and_map(client):
    q = '?source=IGP%2FCENSIS&min_lat=-15&max_lat=-10&min_lon=-76&max_lon=-74'
    counts = [client.get('/api/v1/dashboard/summary' + q).json()['total'],
              client.get('/api/v1/analytics/timeseries' + q).json()['total'],
              client.get('/api/v1/analytics/magnitudes' + q).json()['total'],
              client.get('/api/v1/events/geojson' + q).json()['total']]
    assert counts == [2, 2, 2, 2]


def test_zone_validation(client):
    for q in ('min_lat=-15',
              'min_lat=0&max_lat=-5&min_lon=-80&max_lon=-60',
              'min_lat=-15&max_lat=-10&min_lon=-200&max_lon=-75'):
        assert client.get('/api/v1/dashboard/summary?' + q).status_code == 422


def test_operational_metrics_from_real_tables(client):
    result = client.get('/api/v1/dashboard/operations')
    assert result.status_code == 200
    data = result.json()
    assert data['open_alerts'] == 1
    assert data['enabled_rules'] == 1
    assert data['connector_status'] == 'active'
    assert data['last_run']['records_seen'] == 3
    assert data['latest_event_ingestion_lag_minutes'] == 12.0
