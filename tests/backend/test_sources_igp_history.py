"""Conector visible IGP y ejecuciones paginadas, sin acceso a Supabase real."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool

from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.db.tables import metadata, runs, sources
from app.routes.sources import router


@pytest.fixture
def client():
    engine = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)

    @event.listens_for(engine, 'connect')
    def configure(conn, _):
        conn.execute("ATTACH DATABASE ':memory:' AS public")
        conn.create_function('gen_random_uuid', 0, lambda: uuid4().hex)

    metadata.create_all(engine, tables=[sources, runs])
    igp_id, other_id = uuid4(), uuid4()
    now = datetime(2026, 10, 27, 15, tzinfo=timezone.utc)
    with engine.begin() as conn:
        conn.execute(sources.insert(), [
            dict(id=igp_id, name='IGP/CENSIS', organization='IGP', base_url='https://igp.gob.pe', source_type='api', status='active'),
            dict(id=other_id, name='USGS', organization='USGS', base_url='https://usgs.gov', source_type='api', status='active'),
        ])
        for i in range(13):
            started = now - timedelta(hours=i)
            conn.execute(runs.insert().values(
                id=uuid4(), source_id=igp_id, started_at=started,
                finished_at=started + timedelta(seconds=42),
                status='partial' if i == 2 else 'success',
                records_seen=100, records_inserted=2, records_updated=3,
                error_summary='Omitidos: 1' if i == 2 else None,
            ))
        conn.execute(runs.insert().values(
            id=uuid4(), source_id=other_id, status='failed',
            started_at=now, finished_at=now, error_summary='No mostrar',
        ))
    app = FastAPI()
    app.include_router(router, prefix='/api/v1')
    app.dependency_overrides[get_read_engine] = lambda: engine
    user_id = uuid4()
    app.dependency_overrides[require_user] = lambda: Principal(
        id=user_id, auth_user_id=user_id, email='a@example.com', full_name='Prueba',
        role='solo_lectura', status='active',
    )
    with TestClient(app) as test_client:
        yield test_client, app, engine
    engine.dispose()


def test_listado_publico_igp_sin_errores_internos(client):
    http, _, _ = client
    response = http.get('/api/v1/sources')
    assert response.status_code == 200
    items = response.json()['items']
    assert len(items) == 1 and items[0]['name'] == 'IGP/CENSIS'
    assert items[0]['last_run']['error_summary'] is None


def test_paginacion_real_y_duracion(client):
    http, _, _ = client
    response = http.get('/api/v1/sources/igp/runs?page=2&page_size=5')
    assert response.status_code == 200, response.text
    payload = response.json()
    assert (payload['total'], payload['page'], payload['pages'], len(payload['items'])) == (13, 2, 3, 5)
    assert payload['items'][0]['duration_seconds'] == 42
    assert all(row['status'] in ('partial','success') for row in payload['items'])
    assert http.get('/api/v1/sources/igp/runs?page=1&page_size=20').json()['pages'] == 1


def test_filtro_y_pagina_fuera_de_rango(client):
    http, _, _ = client
    result = http.get('/api/v1/sources/igp/runs?status=partial&page=9&page_size=10').json()
    assert result['total'] == 1 and result['page'] == 1 and len(result['items']) == 1
    assert result['items'][0]['error_summary'] == 'Omitidos: 1'
    assert http.get('/api/v1/sources/igp/runs?page_size=7').status_code == 422
    assert http.get('/api/v1/sources/igp/runs?status=error').status_code == 422


def test_historial_requiere_sesion(client):
    http, app, _ = client
    app.dependency_overrides[require_user] = lambda: (_ for _ in ()).throw(HTTPException(401, 'Inicia sesión'))
    assert http.get('/api/v1/sources/igp/runs').status_code == 401
    assert http.get('/api/v1/sources').status_code == 200
