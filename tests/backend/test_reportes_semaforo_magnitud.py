"""Regresión de Reportes: misma leyenda visual que Mapa sísmico."""
from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape as xml_escape
from zipfile import ZipFile

import pytest

from app.reports import service

CUTOFF = datetime(2026, 10, 27, 16, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize(('magnitude', 'expected'), [
    (-1, 'M < 4.5'),
    (1.2, 'M < 4.5'),
    (4.49, 'M < 4.5'),
    (4.5, 'M 4.5–5.9'),
    (Decimal('5.9'), 'M 4.5–5.9'),
    (5.91, 'M > 5.9'),
    (6.8, 'M > 5.9'),
    (None, 'Sin dato'),
    ('', 'Sin dato'),
    ('not-a-number', 'Sin dato'),
    (float('nan'), 'Sin dato'),
    (float('inf'), 'Sin dato'),
    (True, 'Sin dato'),
])
def test_clasificacion_igp_exacta(magnitude, expected):
    assert service.magnitude_band(magnitude) == expected


def test_cuatro_categorias_y_colores_distintos():
    labels = [label for label, _ in service.MAGNITUDE_BANDS]
    assert labels == ['M < 4.5', 'M 4.5–5.9', 'M > 5.9', 'Sin dato']
    assert len(set(color for _, color in service.MAGNITUDE_BANDS)) == 4


def test_reporte_eventos_incluye_rangos_en_csv_excel_y_pdf():
    magnitudes = [2.1, 4.49, 4.5, 5.9, 6.0, None]
    rows = [dict(fecha_utc=CUTOFF, magnitud=value,
                 fuente='IGP/CENSIS', ubicacion=f'Sismo {index}')
            for index, value in enumerate(magnitudes)]
    labels = [service.magnitude_band(row['magnitud']) for row in rows]
    assert labels.count('M < 4.5') == 2
    assert labels.count('M 4.5–5.9') == 2
    assert labels.count('M > 5.9') == 1
    assert labels.count('Sin dato') == 1
    assert len(labels) == len(rows)

    csv_text = service.render_csv('events', rows, CUTOFF).decode('utf-8-sig')
    for label in service.MAGNITUDE_BANDS:
        assert label[0] in csv_text
    assert 'Rango visual de magnitud' in csv_text
    assert 'USGS' not in csv_text and 'V2' not in csv_text

    xlsx = service.render_xlsx('events', rows, CUTOFF)
    with ZipFile(BytesIO(xlsx)) as workbook:
        sheet = workbook.read('xl/worksheets/sheet1.xml').decode('utf-8')
        for label in service.MAGNITUDE_BANDS:
            assert xml_escape(label[0]) in sheet
        assert 'Rango visual de magnitud' in sheet
        assert 'USGS' not in sheet and 'V2' not in sheet

    pdf = service.render_pdf('events', rows, CUTOFF)
    assert pdf.startswith(b'%PDF-') and len(pdf) > 1000


def test_reportes_distintos_no_reciben_columna_extra():
    assert 'rango_magnitud' not in dict(service.COLUMNS['alerts'])
    assert 'rango_magnitud' not in dict(service.COLUMNS['quality'])
