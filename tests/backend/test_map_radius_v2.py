"""Validación del recorte geográfico circular con base SQLite aislada."""
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


def test_radio_geografico_consistente_en_todos_los_modulos(client):
    """El círculo es un filtro real en SQL, no una decoración en Leaflet."""
    # Un radio de 120 km alrededor de (-12,-75) incluye solo el primer IGP;
    # el resto están a más de 200 km y el USGS queda excluido por fuente.
    q = '?source=IGP%2FCENSIS&center_lat=-12&center_lon=-75&radius_km=120'
    routes = ('/dashboard/summary', '/analytics/timeseries',
              '/analytics/magnitudes', '/events/geojson')
    outputs = [client.get('/api/v1' + path + q) for path in routes]
    assert all(result.status_code == 200 for result in outputs)
    assert [result.json()['total'] for result in outputs] == [1, 1, 1, 1]
    feature = outputs[-1].json()['features'][0]
    assert feature['properties']['external_id'] == 'ev0'


def test_radio_incompleto_o_fuera_de_rango_es_rechazado(client):
    for params in (
        'center_lat=-12',
        'center_lat=-12&center_lon=-75',
        'center_lat=-12&center_lon=-75&radius_km=0',
        'center_lat=-12&center_lon=-75&radius_km=2500',
        'center_lat=-99&center_lon=-75&radius_km=50',
        'center_lat=-12&center_lon=-75&radius_km=50&min_lat=-14&max_lat=-10&min_lon=-77&max_lon=-74',
    ):
        assert client.get('/api/v1/events/geojson?' + params).status_code == 422
