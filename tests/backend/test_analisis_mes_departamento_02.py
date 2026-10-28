"""Mes peruano y etiqueta departamental IGP: pruebas en SQLite aislado."""
from datetime import datetime
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
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @sa_event.listens_for(engine, 'connect')
    def attach(dbapi, _):
        dbapi.execute("ATTACH DATABASE ':memory:' AS public")
    metadata.create_all(engine)
    igp_id, usgs_id = uuid4(), uuid4()
    with engine.begin() as db:
        for sid, name in [(igp_id, 'IGP/CENSIS'), (usgs_id, 'USGS')]:
            db.execute(sources.insert().values(id=sid, name=name, organization=name,
                base_url='https://example.org', source_type='api', status='active'))
        for i, sid, when, place, mag in [
            (1, igp_id, '2026-10-03T14:00:00+00:00', '35 km al S de Zorritos - Tumbes', 4.2),
            (2, igp_id, '2026-10-20T14:00:00+00:00', '20 km al O de Ica - Ica', 3.9),
            (3, igp_id, '2026-09-03T14:00:00+00:00', '40 km al S de Ica - Ica', 3.5),
            (4, igp_id, '2026-10-03T14:00:00+00:00', '12 km al S de Tumbes', 3.4),
            (5, usgs_id, '2026-10-03T14:00:00+00:00', '37 km al SO de Zorritos - Tumbes', 5.2),
        ]:
            db.execute(events.insert().values(
                id=uuid4(), source_id=sid, external_id=f'test-{i}',
                occurred_at=datetime.fromisoformat(when), latitude=-8, longitude=-78,
                magnitude=mag, magnitude_type='Mw', depth_km=34,
                place=place, source_url='https://example.org/event', review_status='unreviewed'))
    app.dependency_overrides[get_read_engine] = lambda: engine
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_departamento_igp_con_periodo(client):
    params = {'reported_department': 'TUMBES',
        'start_time': '2026-10-01T00:00:00-05:00',
        'end_time': '2026-10-31T23:59:59.999-05:00'}
    for uri in ('/api/v1/analytics/timeseries?interval=month', '/api/v1/analytics/magnitudes'):
        response = client.get(uri, params=params)
        assert response.status_code == 200, response.text
        assert response.json()['total'] == 1  # No USGS ni localidad sin etiqueta final
    response = client.get('/api/v1/dashboard/summary', params={**params, 'source': 'IGP/CENSIS'})
    assert response.status_code == 200
    assert response.json()['total'] == 1


def test_filtro_por_departamento_sin_periodo(client):
    response = client.get('/api/v1/analytics/magnitudes', params={'reported_department': 'ICA'})
    assert response.status_code == 200
    assert response.json()['total'] == 2


def test_codigo_desconocido_rechazado(client):
    response = client.get('/api/v1/analytics/timeseries', params={'reported_department': 'TUMBES%_INYECCION'})
    assert response.status_code == 422


def test_fuente_igp_obligatoria(client):
    response = client.get('/api/v1/analytics/magnitudes', params={'reported_department': 'TUMBES', 'source': 'USGS'})
    assert response.status_code == 200
    assert response.json()['total'] == 1
