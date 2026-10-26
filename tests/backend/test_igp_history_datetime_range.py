"""Regresiones del filtro de fecha/hora IGP: no alterar Supabase ni alertas."""
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.igp import history_catalog as history
from app.main import app
from app.routes import igp_history


def event(identifier, stamp):
    row = history.normalize_row({
        'ID': str(identifier), 'FECHA_UTC': stamp[:10].replace('-', ''),
        'HORA_UTC': stamp[11:19].replace(':', ''), 'LATITUD':'-12',
        'LONGITUD':'-77', 'PROFUNDIDAD':'35', 'MAGNITUD':'4.1',
    })
    return row


def catalog():
    events = (
        event(1, '2024-01-01T00:00:00'),
        event(2, '2024-07-15T13:20:30'),
        event(3, '2024-07-15T13:20:59'),
        event(4, '2024-07-15T13:21:00'),
        event(5, '2024-12-31T23:59:59'),
    )
    return history.Catalog(events=events, retrieved_at=datetime.now(timezone.utc),
                           sha256='a'*64, skipped=0, total_source=len(events))


def principal(role='analista'):
    return Principal(id=uuid4(), auth_user_id=uuid4(), full_name='Prueba',
                     email='test@test.test', status='active', role=role)


def test_exact_utc_minute_includes_seconds_and_excludes_next_minute():
    result = history.select_events(catalog(), year_from=2020, year_to=2025,
        start_at=datetime.fromisoformat('2024-07-15T13:20:00+00:00'),
        end_at=datetime.fromisoformat('2024-07-15T13:20:59.999999+00:00'))
    assert [row['id_origen'] for row in result] == ['2', '3']


def test_year_filter_still_works_for_previous_clients():
    assert len(history.select_events(catalog(), year_from=2024, year_to=2024)) == 5
    assert history.select_events(catalog(), year_from=2023, year_to=2023) == []


@pytest.mark.parametrize('extra', [
    {'start_at':'2024-01-01T00:00:00Z'},
    {'start_at':'2024-01-01T00:00:00', 'end_at':'2024-01-02T00:00:00Z'},
    {'start_at':'2024-05-01T00:00:00Z', 'end_at':'2024-04-01T00:00:00Z'},
    {'start_at':'1959-12-31T23:59:59Z', 'end_at':'1960-01-01T00:00:00Z'},
    {'start_at':'2025-12-31T23:59:59Z', 'end_at':'2026-01-01T00:00:00Z'},
])
def test_invalid_ranges_rejected(extra):
    with pytest.raises(ValidationError):
        igp_history.Filters(**extra)


def test_get_dates_are_validated_and_honor_precise_window(monkeypatch):
    monkeypatch.setattr(igp_history, 'get_catalog', catalog)
    app.dependency_overrides[require_user] = lambda: principal('solo_lectura')
    try:
        with TestClient(app) as client:
            uri='/api/v1/igp-history/events'
            response=client.get(uri, params={
                'start_at':'2024-07-15T13:20:00Z',
                'end_at':'2024-07-15T13:20:59.999999Z',
                'page':1,'page_size':20})
            assert response.status_code == 200, response.text
            assert response.json()['total'] == 2
            assert [item['id_origen'] for item in response.json()['items']] == ['2','3']
            wrong=client.get(uri, params={'start_at':'2024-07-15T13:20:00Z'})
            assert wrong.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_export_reuses_same_precise_dates_and_logs_filters(monkeypatch):
    monkeypatch.setattr(igp_history,'get_catalog',catalog)
    inserts=[]
    class Conn:
        def __enter__(self):return self
        def __exit__(self,*args):return False
        def execute(self,statement,*args,**kwargs):inserts.append(statement)
    class Engine:
        def begin(self):return Conn()
    app.dependency_overrides[require_user]=lambda:principal('analista')
    app.dependency_overrides[get_read_engine]=lambda:Engine()
    monkeypatch.setattr(igp_history,'current_settings',lambda conn:{'max_report_rows':100,'report_history_days':90})
    try:
        with TestClient(app) as client:
            response=client.post('/api/v1/igp-history/export',json={
                'format':'csv','start_at':'2024-07-15T13:20:00Z',
                'end_at':'2024-07-15T13:20:59.999999Z',
                'year_from':2024,'year_to':2024})
            assert response.status_code == 200, response.text
            assert b'IGP' in response.content
            assert b'2024-07-15' in response.content
            assert b'2024-01-01' not in response.content
            assert b'2024-12-31' not in response.content
            assert len(inserts)==2
    finally:
        app.dependency_overrides.clear()
