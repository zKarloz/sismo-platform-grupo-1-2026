"""Revisión Reportes 02: contrato de fuente IGP y archivos sin versiones internas."""
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from zipfile import ZipFile

import pytest
from sqlalchemy.dialects import postgresql

from app.reports import service

CUTOFF = datetime(2026, 10, 27, 14, 0, tzinfo=timezone.utc)


class CapturingConnection:
    """Inspecciona el SQL sin depender de las credenciales de Supabase."""
    statement = None

    def execute(self, statement):
        self.statement = statement

        class Empty:
            def mappings(self):
                return self

            def all(self):
                return []

        return Empty()


@pytest.mark.parametrize('kind', ['events', 'alerts', 'sources', 'quality', 'models'])
def test_query_all_types_restricted_to_igp(kind):
    conn = CapturingConnection()
    assert service.query_report(conn, kind, CUTOFF, None, None, None, None, None, 5) == []
    sql = str(conn.statement.compile(
        dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}
    ))
    assert "'IGP/CENSIS'" in sql
    if kind in ('quality', 'models'):
        # Se requieren snapshots IGP, sin ningún evento de otra fuente.
        assert 'dataset_snapshots' in sql
        assert 'EXISTS' in sql
        assert 'NOT (EXISTS' in sql
    else:
        assert 'data_sources.name' in sql


def test_source_override_rejected_on_backend_query():
    with pytest.raises(ValueError, match='Fuente no permitida'):
        service.query_report(CapturingConnection(), 'events', CUTOFF,
                             None, None, 'USGS', None, None, 5)


def test_export_files_have_explicit_igp_and_no_v2():
    rows = [{'fecha_utc': CUTOFF, 'magnitud': 4.2, 'profundidad_km': 30,
             'latitud': -12.1, 'longitud': -77.0, 'ubicacion': 'Lima',
             'fuente': service.IGP_SOURCE, 'id_origen': 'IGP-123',
             'url_origen': 'https://example.org/reporte'}]
    note = service.IGP_REPORT_NOTES['events']
    csv_bytes = service.render_csv('events', rows, CUTOFF, note)
    text = csv_bytes.decode('utf-8-sig')
    assert 'IGP/CENSIS' in text and 'USGS' not in text and 'V2' not in text

    xlsx_bytes = service.render_xlsx('events', rows, CUTOFF, note)
    with ZipFile(BytesIO(xlsx_bytes)) as excel:
        sheet = excel.read('xl/worksheets/sheet1.xml').decode('utf-8')
        assert 'IGP/CENSIS' in sheet and 'USGS' not in sheet and 'V2' not in sheet

    pdf_bytes = service.render_pdf('events', rows, CUTOFF, note)
    assert pdf_bytes.startswith(b'%PDF-')
    assert len(pdf_bytes) > 1000


def test_pdf_descriptive_charts_for_igp_only():
    cases = {
        'quality': [{'dataset': 'Eventos IGP', 'version': 1, 'filas': 124}],
        'models': [{'algoritmo': 'regresion_lineal', 'dataset': 'Eventos IGP'}],
        'alerts': [{'fuente': 'IGP/CENSIS', 'estado': 'enviada', 'ubicacion': 'Ica'}],
        'sources': [{'fuente': 'IGP/CENSIS', 'estado': 'activo'}],
    }
    for kind, rows in cases.items():
        document = service.render_pdf(kind, rows, CUTOFF, service.IGP_REPORT_NOTES[kind])
        assert document.startswith(b'%PDF-'), kind


def test_route_rejects_usgs_without_frontend():
    """El formulario oculto no debe ser la única barrera contra otras fuentes."""
    from pydantic import ValidationError
    from app.routes.reports import ReportInput

    with pytest.raises(ValidationError):
        ReportInput(kind='events', format='csv', source='USGS')
    # La compatibilidad con clientes anteriores permite únicamente IGP explícito.
    assert ReportInput(kind='events', format='csv', source='IGP/CENSIS').source == 'IGP/CENSIS'


def test_history_igp_filter_is_server_side():
    """La página y el total deben contar solo manifiestos de procedencia IGP."""
    from uuid import uuid4
    from app.auth.security import Principal
    from app.routes.reports import report_history

    statements = []

    class Engine:
        def connect(self):
            class Connection:
                def __enter__(self):
                    return self

                def __exit__(self, *_):
                    return False

                def execute(self, statement):
                    sql = str(statement.compile(
                        dialect=postgresql.dialect(),
                        compile_kwargs={'literal_binds': True},
                    ))
                    statements.append(sql)

                    class Result:
                        def scalar_one(self):
                            return 0

                        def mappings(self):
                            return self

                        def all(self):
                            return []
                    return Result()
            return Connection()

    actor = Principal(id=uuid4(), auth_user_id=uuid4(), email='test@example.org',
                      full_name='Prueba', role='administrador', status='active')
    output = report_history(page=1, page_size=5, principal=actor, engine=Engine())
    assert output['items'] == [] and output['total'] == 0
    assert len(statements) == 2
    for sql in statements:
        assert 'source_policy' in sql and 'igp_only' in sql
        assert 'IGP/CENSIS' in sql
