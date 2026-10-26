"""Fase 8: límites, RBAC, formato y prevención de inyección/filtrado incorrecto."""
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.main import app
from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.reports import service
from app.routes import reports
from app.db.tables import events, report_exports
from uuid import uuid4

UTC = datetime(2026,10,24,22,0,tzinfo=timezone.utc)


def principal(role: str):
    return Principal(id=uuid4(),auth_user_id=uuid4(),email='test@proyecto.test',
                     full_name='Cuenta de prueba',role=role,status='active')


def test_report_requires_login():
    app.dependency_overrides[get_read_engine]=lambda:object()
    try:
        with TestClient(app) as client:
            response=client.get('/api/v1/reports/options')
        assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize('role,kinds',[
    ('administrador',5),('analista',4),('operador_alertas',3),('auditor',5),('solo_lectura',0),
])
def test_rbac_report_options(role,kinds):
    app.dependency_overrides[require_user]=lambda:principal(role)
    try:
        with TestClient(app) as client:
            response=client.get('/api/v1/reports/options')
        assert response.status_code == 200
        assert len(response.json()['types'])==kinds
    finally:
        app.dependency_overrides.clear()


def test_report_input_rejects_bad_dates_and_zone_and_unrelated_filters():
    with pytest.raises(ValidationError):
        reports.ReportInput(kind='events',format='csv',start_at='2026-10-24T12:00:00')
    with pytest.raises(ValidationError):
        reports.ReportInput(kind='quality',format='pdf',min_magnitude=4.0)
    with pytest.raises(ValidationError):
        reports.ReportInput(kind='alerts',format='csv',south=-10,north=0)
    with pytest.raises(ValidationError):
        reports.ReportInput(kind='events',format='csv',south=5,north=-5,west=-80,east=-70)


def test_csv_injection_protection_and_provenance():
    content=service.render_csv('events',[{'fecha_utc':UTC,'magnitud':3.6,
        'ubicacion':' =IMPORTXML(1,2)','latitud':-16.5,'fuente':'IGP/CENSIS','url_origen':'https://igp.gob.pe'}],UTC)
    assert content.startswith(b'\xef\xbb\xbf')
    decoded=content.decode('utf-8-sig')
    assert "' =IMPORTXML" in decoded
    assert "-16.5" in decoded and "'-16.5" not in decoded
    assert 'IGP/CENSIS' in decoded and '2026-10-24' in decoded


def test_xlsx_is_valid_ooxml_and_formula_is_text():
    content=service.render_xlsx('events',[{'ubicacion':'=2+3','fuente':'IGP/CENSIS'}],UTC)
    with ZipFile(BytesIO(content)) as workbook:
        assert workbook.testzip() is None
        sheet=workbook.read('xl/worksheets/sheet1.xml').decode()
        assert 't="inlineStr"' in sheet
        assert '=2+3' in sheet
        assert '<f>' not in sheet
        assert 'autoFilter' in sheet


def test_pdf_is_real_and_contains_report_pages():
    content=service.render_pdf('events',[{'magnitud':4.2,'fuente':'IGP/CENSIS','ubicacion':'Cusco'}],UTC)
    assert content.startswith(b'%PDF-') and len(content)>1000


def test_events_query_is_bounded_and_filters_source():
    class Conn:
        def __init__(self):self.statement=None
        def execute(self,stmt):
            self.statement=stmt
            class Result:
                def mappings(self):return self
                def all(self):return []
            return Result()
    conn=Conn()
    service.query_report(conn,'events',UTC,None,None,'IGP/CENSIS',3.5,(-20,-84,0,-68),100)
    statement=str(conn.statement.compile(dialect=postgresql.dialect()))
    assert 'LIMIT' in statement
    assert 'data_sources.name' in statement
    assert 'seismic_events.latitude' in statement


def test_no_silent_truncation(monkeypatch):
    class FakeEngine:
        def begin(self):
            class Conn:
                def __enter__(self):return self
                def __exit__(self,*args):return False
                def execute(self,*args,**kwargs):raise AssertionError('No guardar un informe truncado')
            return Conn()
    monkeypatch.setattr(reports,'current_settings',lambda conn:{**reports.DEFAULT_SETTINGS,'max_report_rows':50})
    monkeypatch.setattr(reports,'query_report',lambda *args,**kwargs:[{}]*51)
    app.dependency_overrides[require_user]=lambda:principal('administrador')
    app.dependency_overrides[get_read_engine]=lambda:FakeEngine()
    try:
        with TestClient(app) as client:
            response=client.post('/api/v1/reports/generate',json={'kind':'events','format':'csv'})
        assert response.status_code == 413
    finally:
        app.dependency_overrides.clear()


def test_settings_rbac_blocks_non_admin():
    app.dependency_overrides[require_user]=lambda:principal('solo_lectura')
    try:
        with TestClient(app) as client:
            res=client.patch('/api/v1/admin/system/settings',json={'key':'max_report_rows','value_int':500})
        assert res.status_code==403
    finally:
        app.dependency_overrides.clear()
