"""Regresiones Fase 8: filtros equivalentes => mismas filas sin importar formato."""
from datetime import datetime, timezone
from io import StringIO
import csv

from fastapi.testclient import TestClient

from app.main import app
from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.reports import service
from app.routes import reports
from uuid import uuid4


def test_csv_pdf_include_same_rows():
    """La presentación PDF nunca debe eliminar filas que llegaron del backend."""
    cutoff = datetime(2026, 10, 25, 21, 0, tzinfo=timezone.utc)
    rows = [
        {'fecha_utc': datetime(2026,8,31,15,0,tzinfo=timezone.utc),
         'magnitud':4.1,'ubicacion':'Arequipa, Peru','fuente':'USGS'},
        {'fecha_utc': datetime(2026,8,2,17,0,tzinfo=timezone.utc),
         'magnitud':4.5,'ubicacion':'Tumbes, Peru','fuente':'USGS'},
    ]
    csv_data = service.render_csv('events', rows, cutoff).decode('utf-8-sig')
    table = list(csv.reader(StringIO(csv_data)))
    assert len(table)-3 == 2
    # Inspeccionar el contenido entregado a ReportLab, sin dependencias extra.
    captured = {}
    original = service.SimpleDocTemplate
    class InspectDoc:
        def __init__(self, output, **kwargs):
            self.output = output
        def build(self, flowables, **kwargs):
            captured['flowables'] = flowables
            self.output.write(b'%PDF-TEST')
    service.SimpleDocTemplate = InspectDoc
    try:
        service.render_pdf('events', rows, cutoff)
    finally:
        service.SimpleDocTemplate = original
    paragraphs = [item.text for item in captured['flowables'] if isinstance(item, service.Paragraph)]
    assert any('Registros: 2' in text for text in paragraphs)
    report_table = next(item for item in captured['flowables'] if isinstance(item, service.PDFTable))
    assert len(report_table._cellvalues) == len(rows) + 1  # Encabezado + filas.


def test_empty_query_returns_422_without_creating_history(monkeypatch):
    """Consulta vacía => advertencia legible, nunca PDF 0 filas auditado como generado."""
    class StubEngine:
        def begin(self):
            class Conn:
                def __enter__(self):return self
                def __exit__(self,*args):return False
                def execute(self,*args,**kwargs):
                    raise AssertionError('No se debe guardar informe vacío ni bitácora de éxito')
            return Conn()
    monkeypatch.setattr(reports,'current_settings',lambda conn:reports.DEFAULT_SETTINGS)
    monkeypatch.setattr(reports,'query_report',lambda *args,**kwargs:[])
    user = Principal(id=uuid4(),auth_user_id=uuid4(),email='admin@test.local',
                     full_name='Prueba',role='administrador',status='active')
    app.dependency_overrides[require_user] = lambda: user
    app.dependency_overrides[get_read_engine] = lambda: StubEngine()
    try:
        with TestClient(app) as client:
            for fmt in ('pdf','csv','xlsx'):
                response=client.post('/api/v1/reports/generate',json={
                    'kind':'events','format':fmt,'source':'IGP/CENSIS',
                    'start_at':'2026-08-01T05:00:00Z','end_at':'2026-09-01T04:59:59Z'})
                assert response.status_code == 422
                assert 'No hay registros' in response.json()['detail']
    finally:
        app.dependency_overrides.clear()
