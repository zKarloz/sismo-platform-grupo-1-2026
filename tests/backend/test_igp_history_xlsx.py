"""Regresiones XLSX del repositorio CENSIS: lectura segura, proveniencia y permisos."""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape

import pytest

from app.igp import history_catalog as hist
from app.routes.igp_history import source_info


HEADERS = ['fecha UTC', 'hora UTC', 'latitud (º)', 'longitud (º)',
           'profundidad (km)', 'magnitud (M)']


def fixture_xlsx(path: Path, data_rows: list[list[str]] | None = None,
                 *, headers: list[str] | None = None, use_formula: bool = False) -> None:
    """Genera OOXML mínimo estático (sin usar Excel) para pruebas reproducibles."""
    rows = [headers or HEADERS] + (data_rows if data_rows is not None else [
        ['2024-03-05', '01:23:45.00', '-12.3', '-77.1', '33', '4.5'],
        ['2025-12-31', '20:34:41.00', '-12.89', '-76.85', '51', '3.9'],
    ])
    letters = 'ABCDEF'
    xml_rows = []
    for rindex, values in enumerate(rows, 1):
        cells = []
        for cindex, value in enumerate(values):
            column = letters[cindex]
            if use_formula and rindex == 2 and cindex == 5:
                cell = f'<c r="{column}{rindex}"><f>2+2</f><v>4</v></c>'
            else:
                cell = (f'<c r="{column}{rindex}" t="inlineStr"><is>'
                        f'<t>{escape(value)}</t></is></c>')
            cells.append(cell)
        xml_rows.append(f'<row r="{rindex}">{"".join(cells)}</row>')
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    worksheet = f'<worksheet xmlns="{ns}"><sheetData>{"".join(xml_rows)}</sheetData></worksheet>'
    with ZipFile(path, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('xl/worksheets/sheet1.xml', worksheet)


def test_xlsx_snapshot_uses_censis_source_and_utc_dates(tmp_path):
    path = tmp_path / 'data.xlsx'
    fixture_xlsx(path)
    result = hist._read_official_xlsx(path)
    assert result.source_mode == 'censis_xlsx_snapshot'
    assert result.total_source == 2 and result.skipped == 0
    assert result.xlsx_sha256 == sha256(path.read_bytes()).hexdigest()
    y2024 = hist.select_events(result, year_from=2024, year_to=2024)
    assert len(y2024) == 1
    assert y2024[0]['fecha_utc'] == '2024-03-05T01:23:45+00:00'
    assert y2024[0]['id_origen'] == 'Fila 2'
    assert y2024[0]['url_origen'] == hist.CENSIS_PAGE
    meta = source_info(result)
    assert meta['published_at'] is None
    assert meta['resource_url'] == hist.CENSIS_PAGE
    assert meta['original_xlsx_sha256'] == result.xlsx_sha256


def test_xlsx_prioritized_over_old_csv(tmp_path, monkeypatch):
    xlsx = tmp_path / 'catalog.xlsx'
    fixture_xlsx(xlsx)
    csv_path = tmp_path / 'catalog.csv'
    csv_path.write_text('csv no compatible', encoding='utf-8')
    monkeypatch.setenv('IGP_HISTORY_XLSX_PATH', str(xlsx))
    monkeypatch.setenv('IGP_HISTORY_CSV_PATH', str(csv_path))
    result = hist._read_source()
    assert len(result.events) == 2
    assert result.source_mode == 'censis_xlsx_snapshot'


def test_missing_explicit_xlsx_is_not_hidden_by_csv(tmp_path, monkeypatch):
    monkeypatch.setenv('IGP_HISTORY_XLSX_PATH', str(tmp_path / 'missing.xlsx'))
    with pytest.raises(hist.CatalogError, match='No se encontró'):
        hist._read_source()


@pytest.mark.parametrize('data', [b'', b'<html>error</html>', b'not an Excel file'])
def test_corrupted_xlsx_fails_closed(tmp_path, data):
    path = tmp_path / 'catalog.xlsx'
    path.write_bytes(data)
    with pytest.raises(hist.CatalogError):
        hist._read_official_xlsx(path)


def test_wrong_headers_and_formula_fail_closed(tmp_path):
    path = tmp_path / 'catalog.xlsx'
    fixture_xlsx(path, headers=['a', 'b', 'c', 'd', 'e', 'f'])
    with pytest.raises(hist.CatalogError, match='columnas CENSIS'):
        hist._read_official_xlsx(path)
    fixture_xlsx(path, use_formula=True)
    with pytest.raises(hist.CatalogError, match='fórmulas'):
        hist._read_official_xlsx(path)


def test_invalid_date_counts_skip_without_inventing_record(tmp_path):
    path = tmp_path / 'catalog.xlsx'
    fixture_xlsx(path, data_rows=[
        ['2024-02-30', '00:00:00', '-12', '-77', '35', '3.5'],
        ['2024-03-01', '00:00:00.00', '-12', '-77', '35', '3.5'],
    ])
    result = hist._read_official_xlsx(path)
    assert result.total_source == 2 and result.skipped == 1
    assert len(result.events) == 1


def test_filters_and_export_renderer_with_xlsx_source(tmp_path):
    from datetime import datetime, timezone
    from app.reports.service import render_file

    path = tmp_path / 'catalog.xlsx'
    fixture_xlsx(path)
    result = hist._read_official_xlsx(path)
    rows = hist.select_events(result, year_from=2024, year_to=2024,
                              min_magnitude=4, max_depth=100)
    assert len(rows) == 1
    for format_ in ('csv', 'xlsx', 'pdf'):
        output, _ = render_file('events', format_, rows, datetime.now(timezone.utc),
                                source_note=f'CENSIS {hist.CENSIS_PAGE} | {result.sha256}')
        assert len(output) > 100
        if format_ == 'pdf':
            assert output.startswith(b'%PDF-')
