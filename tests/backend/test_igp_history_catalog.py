"""Pruebas sin red de catálogo histórico oficial, metadatos, RBAC y exportación."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4
from types import SimpleNamespace
from io import BytesIO
from zipfile import ZipFile

import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.igp import history_catalog as catalog
from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.routes import igp_history


def sample(identifier='1', day='20240305',hour='12345',magnitude='4.5'):
    return {'ID':identifier,'FECHA_UTC':day,'HORA_UTC':hour,
            'LATITUD':'-12.3','LONGITUD':'-77.1','PROFUNDIDAD':'33','MAGNITUD':magnitude,
            'FECHA_CORTE':'20260528'}


def user(role):
    return Principal(id=uuid4(),auth_user_id=uuid4(),full_name='Prueba',email='test@demo.test',
                     status='active',role=role)


def make_catalog():
    return catalog.Catalog(events=tuple([catalog.normalize_row(sample())]),
                           retrieved_at=datetime(2026,6,15,tzinfo=timezone.utc),
                           sha256='a'*64,skipped=0,total_source=1)


def test_historical_row_uses_utc_and_does_not_fabricate_censis_id():
    result=catalog.normalize_row(sample())
    assert result['fecha_utc']=='2024-03-05T01:23:45+00:00'
    assert result['id']=='IGP-HIST-1'
    assert result['id_origen']=='1'
    assert result['url_origen']==catalog.SOURCE_PAGE
    assert result['ubicacion'] is None


@pytest.mark.parametrize('bad',[{'FECHA_UTC':'20250230'},{'HORA_UTC':'256000'},
                                {'MAGNITUD':'Inf'},{'LATITUD':'-999'}, {'ID':''},
                                {'FECHA_UTC':'20260101'}])
def test_bad_rows_are_rejected(bad):
    with pytest.raises(ValueError):catalog.normalize_row({**sample(),**bad})


def test_fetch_paginated_and_sha256_and_skips(monkeypatch):
    # Página pequeña simulada; la API puede reducir el límite solicitado.
    data=[sample('1'),{**sample('2'), 'FECHA_UTC':'20240508'},
          {**sample('3'),'FECHA_UTC':'invalid'}]
    seen=[]
    def fake_get(url,params,timeout,headers):
        assert url==catalog.DATA_URL
        seen.append(params['offset'])
        offset=params['offset']; rows=data[offset:offset+2]
        return httpx.Response(200,json={'success':True,'result':{'records':rows,'total':3}},
                              request=httpx.Request('GET',url))
    monkeypatch.setattr(catalog.httpx,'get',fake_get)
    result=catalog._read_datastore_api()
    assert seen==[0,2]
    assert result.total_source==3 and result.skipped==1 and len(result.events)==2
    assert len(result.sha256)==64


def test_total_does_not_allow_silent_truncation(monkeypatch):
    def fake_get(url,params,timeout,headers):
        rows=[sample()] if params['offset']==0 else []
        return httpx.Response(200,json={'success':True,'result':{'records':rows,'total':5}},
                              request=httpx.Request('GET',url))
    monkeypatch.setattr(catalog.httpx,'get',fake_get)
    with pytest.raises(catalog.CatalogError,match='incompleta'):
        catalog._read_datastore_api()


def test_filters_match_year_magnitude_depth_bounds():
    a=catalog.normalize_row(sample())
    b=catalog.normalize_row(sample('2','19701225','152233','5.5'))
    snap=catalog.Catalog(events=(a,b),retrieved_at=datetime.now(timezone.utc),
                         sha256='c'*64,skipped=0,total_source=2)
    assert catalog.select_events(snap,year_from=2024,year_to=2024,min_magnitude=4.5,max_depth=33)==[a]
    assert catalog.select_events(snap,year_from=2024,year_to=2024,south=-13,west=-78,north=-12,east=-77)==[a]
    assert catalog.select_events(snap,year_from=2024,year_to=2024,min_magnitude=4.6)==[]


def test_no_login_denied():
    app.dependency_overrides[get_read_engine]=lambda:object()
    try:
        with TestClient(app) as client:
            assert client.get('/api/v1/igp-history/events').status_code==401
    finally:app.dependency_overrides.clear()


def test_filters_reject_inverted_or_partial_zone():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):igp_history.Filters(year_from=2025,year_to=2020)
    with pytest.raises(ValidationError):igp_history.Filters(south=-20)


def test_reader_and_public_provenance(monkeypatch):
    monkeypatch.setattr(igp_history,'get_catalog',lambda:make_catalog())
    app.dependency_overrides[require_user]=lambda:user('solo_lectura')
    app.dependency_overrides[get_read_engine]=lambda:object()
    try:
        with TestClient(app) as client:
            result=client.get('/api/v1/igp-history/events?year_from=2024&year_to=2024')
            assert result.status_code==200
            assert result.json()['total']==1
            assert result.json()['source']['snapshot_sha256']=='a'*64
            assert result.json()['source']['storage'].startswith('Caché')
            assert client.post('/api/v1/igp-history/export',json={'format':'pdf'}).status_code==403
    finally:
        app.dependency_overrides.clear()


def test_server_down_not_fake_empty_list(monkeypatch):
    def unavailable():raise catalog.CatalogError('Proveedor no disponible')
    monkeypatch.setattr(igp_history,'get_catalog',unavailable)
    app.dependency_overrides[require_user]=lambda:user('administrador')
    try:
        with TestClient(app) as client:
            response=client.get('/api/v1/igp-history/events')
            assert response.status_code==503
            assert 'disponible' in response.json()['detail']
    finally:app.dependency_overrides.clear()


def test_export_rejects_empty_and_truncation(monkeypatch):
    monkeypatch.setattr(igp_history,'get_catalog',lambda:make_catalog())
    class Conn:
        def __enter__(self):return self
        def __exit__(self,*args):return False
        def execute(self,*args,**kwargs):raise AssertionError('No debe escribir si no hay filas')
    class Engine:
        def begin(self):return Conn()
    app.dependency_overrides[require_user]=lambda:user('administrador')
    app.dependency_overrides[get_read_engine]=lambda:Engine()
    monkeypatch.setattr(igp_history,'current_settings',lambda conn:{'max_report_rows':100,'report_history_days':90})
    try:
        with TestClient(app) as client:
            response=client.post('/api/v1/igp-history/export',json={'format':'csv',
                                           'year_from':1960,'year_to':1960})
            assert response.status_code==422
    finally:app.dependency_overrides.clear()


def test_report_files_include_version_for_csv_xlsx_pdf():
    from app.reports.service import render_file
    row=catalog.normalize_row(sample())
    from datetime import datetime
    now=datetime.now(timezone.utc)
    note='IGP instrumental | SHA: '+'a'*64
    for format_ in ('csv','xlsx','pdf'):
        content, _=render_file('events',format_,[row],now,source_note=note)
        if format_=='csv':assert note.encode() in content
        elif format_=='pdf':assert content.startswith(b'%PDF-')
        else:
            with ZipFile(BytesIO(content)) as book:
                assert note in book.read('xl/worksheets/sheet1.xml').decode()


def test_caches_fallback_on_provider_failure_and_marks_stale(monkeypatch):
    current=make_catalog()
    monkeypatch.setattr(catalog,'_cache',current)
    def offline():raise catalog.CatalogError('Proveedor caído')
    monkeypatch.setattr(catalog,'_read_source',offline)
    stale=catalog.get_catalog(refresh=True)
    assert stale.stale is True and stale.sha256==current.sha256
    assert stale.events==current.events


def test_export_is_audited_with_version_and_does_not_touch_datasets(monkeypatch):
    monkeypatch.setattr(igp_history,'get_catalog',lambda:make_catalog())
    captured=[]
    class Conn:
        def __enter__(self):return self
        def __exit__(self,*args):return False
        def execute(self,stmt,*args,**kwargs):
            captured.append(stmt)
    class Engine:
        def begin(self):return Conn()
    app.dependency_overrides[require_user]=lambda:user('analista')
    app.dependency_overrides[get_read_engine]=lambda:Engine()
    monkeypatch.setattr(igp_history,'current_settings',lambda conn:{'max_report_rows':100,'report_history_days':90})
    try:
        with TestClient(app) as client:
            response=client.post('/api/v1/igp-history/export',json={
                'format':'csv','year_from':2024,'year_to':2024})
        assert response.status_code==200,response.text
        assert response.headers['x-source-sha256']=='a'*64
        assert b'Fuente: IGP' in response.content
        assert b'versi' in response.content
        assert len(captured)==2  # report_exports y audit_logs; nunca seismic_events.
        rendered=str(captured[0])+' '+str(captured[1])
        assert 'report_exports' in rendered and 'audit_logs' in rendered
        assert 'datasets' not in rendered and 'seismic_events' not in rendered
    finally:app.dependency_overrides.clear()
