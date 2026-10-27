"""Informes en memoria con límites duros, filtros registrados y fuente verificable.

Los archivos no se guardan en Render ni se comparten por una URL anónima.
Cada descarga incorpora fecha de corte UTC, tipo de fuente y el SHA256 del archivo.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
from datetime import datetime, timezone
from io import BytesIO, StringIO
from xml.sax.saxutils import escape as xml_escape
from zipfile import ZipFile, ZIP_DEFLATED

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table as PDFTable, TableStyle, Spacer, KeepTogether
from sqlalchemy import select

from app.db.tables import (events, sources, datasets, snapshot_rows, ml_experiments,
                           alert_rules, alerts, deliveries, runs)

# Esquemas explícitos: nunca exportar campos secretos ni destinos de otras cuentas.
COLUMNS = {
    'events': [('fecha_utc','Fecha UTC'), ('magnitud','Magnitud'),
               ('rango_magnitud','Rango visual de magnitud'), ('profundidad_km','Prof. km'),
               ('latitud','Latitud'),('longitud','Longitud'),('ubicacion','Ubicación'),
               ('fuente','Fuente'),('id_origen','ID origen'),('url_origen','URL oficial')],
    'quality': [('dataset','Dataset'),('version','Versión'),('filas','Filas'),
                ('hash','SHA256 dataset'),('metricas_calidad','Resumen calidad'),('creado_utc','Creado UTC'),('periodo_inicio','Inicio'),('periodo_fin','Fin')],
    'models': [('dataset','Dataset'),('version','Dataset v'),('tarea','Tarea'),('algoritmo','Algoritmo'),
               ('objetivo','Objetivo'),('metricas','Métricas'),('sha_dataset','SHA256 dataset'),('fecha_utc','Fecha UTC')],
    'sources': [('fuente','Fuente'),('organizacion','Organización'),('estado','Estado'),
                ('ultima_sync_utc','Última consulta UTC'),('ultimo_exito_utc','Último éxito UTC'),
                ('url','URL proveedor'),('licencia','Licencia')],
    'alerts': [('fecha_utc','Creada UTC'),('magnitud','Magnitud'),('ubicacion','Ubicación'),
               ('fuente','Fuente'),('regla','Regla'),('prioridad','Prioridad'),
               ('estado','Estado'),('canal','Canal'),('url_origen','URL oficial')],
}
IGP_SOURCE = "IGP/CENSIS"

# Leyenda visual acordada para el mapa y los reportes de eventos IGP.
# Los colores no representan intensidad, daños ni una alerta oficial.
MAGNITUDE_BANDS = (
    ('M < 4.5', '#16A34A'),      # Verde
    ('M 4.5–5.9', '#EAB308'),    # Amarillo
    ('M > 5.9', '#DC2626'),     # Rojo
    ('Sin dato', '#78909C'),    # Celeste grisáceo
)


def magnitude_band(value: object) -> str:
    """Clasifica toda magnitud numérica finita sin dejar sismos sin contar."""
    try:
        if value is None or isinstance(value, bool):
            return 'Sin dato'
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return 'Sin dato'
    if not math.isfinite(number):
        return 'Sin dato'
    if number < 4.5:
        return 'M < 4.5'
    if number <= 5.9:
        return 'M 4.5–5.9'
    return 'M > 5.9'


def report_cell(kind: str, row: dict, key: str) -> object:
    """Incluye la categoría visual en CSV, Excel y PDF de eventos."""
    if kind == 'events' and key == 'rango_magnitud':
        return magnitude_band(row.get('magnitud'))
    return row.get(key)


KINDS = {
    'events':'Eventos registrados', 'quality':'Calidad y datasets',
    'models':'Experimentos ML retrospectivos', 'sources':'Fuentes verificadas',
    'alerts':'Alertas operativas informativas',
}


def csv_cell(value: object) -> str:
    """Evita CSV injection también cuando Excel ignora espacios iniciales."""
    if value is None:
        return ''
    if isinstance(value, (int,float)) and not isinstance(value,bool):
        return str(value)  # Negativos numéricos son datos, no fórmulas.
    result = normalize(value)
    if result.lstrip('\ufeff\x00 \t\r\n').startswith(('=','+','-','@')):
        return "'" + result
    return result


def normalize(value: object) -> str:
    if value is None:
        return ''
    if isinstance(value, float):
        return f'{value:.3f}'.rstrip('0').rstrip('.')
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat(timespec='seconds')
    return str(value)


def igp_dataset_conditions():
    """Confirma la procedencia del conjunto completo, no solo de una muestra.

    SQL correlacionado a datasets.id, reutilizable para calidad y modelos ML.
    Un registro sin snapshot verificable no autoriza atribuir la fuente IGP.
    """
    membership = snapshot_rows.join(events, snapshot_rows.c.event_id == events.c.id).join(
        sources, events.c.source_id == sources.c.id)
    has_igp = select(snapshot_rows.c.event_id).select_from(membership).where(
        snapshot_rows.c.dataset_id == datasets.c.id,
        sources.c.name == IGP_SOURCE,
    ).exists()
    has_other = select(snapshot_rows.c.event_id).select_from(membership).where(
        snapshot_rows.c.dataset_id == datasets.c.id,
        sources.c.name != IGP_SOURCE,
    ).exists()
    return (has_igp, ~has_other)


def query_report(conn, kind: str, cutoff: datetime, start: datetime | None,
                 end: datetime | None, source: str | None, min_magnitude: float | None,
                 bounds: tuple[float,float,float,float] | None, limit: int) -> list[dict]:
    """Consultas deterministas (orden + id) y fechadas. No cambia datos fuente.

    Si el catálogo se revisa con posterioridad, un nuevo informe NO sustituye
    una fotografía inmutable. Solo datasets versionados ofrecen snapshots.
    """
    # Las exportaciones visibles al cliente usan únicamente sismos IGP/CENSIS.
    # Nunca confiar en un selector del frontend para imponer esta política.
    if source not in (None, IGP_SOURCE):
        raise ValueError('Fuente no permitida para nuevos reportes')
    if kind == 'events':
        rel = events.join(sources, sources.c.id == events.c.source_id)
        conditions = [events.c.received_at <= cutoff, sources.c.name == IGP_SOURCE]
        if start: conditions.append(events.c.occurred_at >= start)
        if end: conditions.append(events.c.occurred_at <= end)
        if min_magnitude is not None: conditions.append(events.c.magnitude >= min_magnitude)
        if bounds:
            south, west, north, east = bounds
            conditions += [events.c.latitude >= south, events.c.latitude <= north,
                           events.c.longitude >= west, events.c.longitude <= east]
        query = select(events.c.occurred_at.label('fecha_utc'), events.c.magnitude.label('magnitud'),
                       events.c.depth_km.label('profundidad_km'), events.c.latitude.label('latitud'),
                       events.c.longitude.label('longitud'), events.c.place.label('ubicacion'),
                       sources.c.name.label('fuente'), events.c.external_id.label('id_origen'),
                       events.c.source_url.label('url_origen')).select_from(rel).where(*conditions)
        query = query.order_by(events.c.occurred_at.desc(), events.c.id.desc())
    elif kind == 'quality':
        # La procedencia no es un atributo de datasets: se valida mediante cada
        # evento persistido en dataset_snapshots. Los datasets vacíos, mixtos o
        # sin snapshots quedan fuera en lugar de etiquetarse falsamente IGP.
        conditions = [datasets.c.created_at <= cutoff, *igp_dataset_conditions()]
        if start: conditions.append(datasets.c.created_at >= start)
        if end: conditions.append(datasets.c.created_at <= end)
        query = select(datasets.c.name.label('dataset'), datasets.c.version,
                       datasets.c.row_count.label('filas'), datasets.c.content_sha256.label('hash'),
                       datasets.c.quality_report.label('metricas_calidad'), datasets.c.created_at.label('creado_utc'),
                       datasets.c.period_start.label('periodo_inicio'),
                       datasets.c.period_end.label('periodo_fin')).where(*conditions).order_by(
                           datasets.c.created_at.desc(), datasets.c.id.desc())
    elif kind == 'models':
        conditions = [ml_experiments.c.created_at <= cutoff, *igp_dataset_conditions()]
        if start: conditions.append(ml_experiments.c.created_at >= start)
        if end: conditions.append(ml_experiments.c.created_at <= end)
        rel = ml_experiments.join(datasets, ml_experiments.c.dataset_id == datasets.c.id)
        query = select(datasets.c.name.label('dataset'),datasets.c.version,
                       ml_experiments.c.task_type.label('tarea'),
                       ml_experiments.c.algorithm.label('algoritmo'),
                       ml_experiments.c.target_name.label('objetivo'),
                       ml_experiments.c.metrics.label('metricas'),
                       ml_experiments.c.dataset_sha256.label('sha_dataset'),
                       ml_experiments.c.created_at.label('fecha_utc')).select_from(rel).where(*conditions).order_by(
                           ml_experiments.c.created_at.desc(), ml_experiments.c.id.desc())
    elif kind == 'sources':
        conditions = [sources.c.created_at <= cutoff, sources.c.name == IGP_SOURCE]
        query = select(sources.c.name.label('fuente'), sources.c.organization.label('organizacion'),
                       sources.c.status.label('estado'),sources.c.last_sync_at.label('ultima_sync_utc'),
                       sources.c.last_success_at.label('ultimo_exito_utc'),
                       sources.c.base_url.label('url'),sources.c.license_notes.label('licencia'))\
               .where(*conditions).order_by(sources.c.name, sources.c.id)
    elif kind == 'alerts':
        rel = alerts.join(events, alerts.c.event_id == events.c.id).join(sources, events.c.source_id == sources.c.id).join(
            alert_rules, alerts.c.rule_id == alert_rules.c.id)
        conditions = [alerts.c.created_at <= cutoff, sources.c.name == IGP_SOURCE]
        if start: conditions.append(alerts.c.created_at >= start)
        if end: conditions.append(alerts.c.created_at <= end)
        if min_magnitude is not None: conditions.append(events.c.magnitude >= min_magnitude)
        if bounds:
            south, west, north, east = bounds
            conditions += [events.c.latitude >= south, events.c.latitude <= north,
                           events.c.longitude >= west, events.c.longitude <= east]
        query = select(alerts.c.created_at.label('fecha_utc'), events.c.magnitude.label('magnitud'),
                       events.c.place.label('ubicacion'), sources.c.name.label('fuente'),
                       alert_rules.c.name.label('regla'), alerts.c.severity.label('prioridad'),
                       alerts.c.status.label('estado'),alert_rules.c.channel.label('canal'),
                       events.c.source_url.label('url_origen')).select_from(rel).where(*conditions).order_by(
                           alerts.c.created_at.desc(), alerts.c.id.desc())
    else:
        raise ValueError('Tipo de reporte no admitido')
    # +1 revela exceso; nunca truncar datos silenciosamente.
    return [dict(record) for record in conn.execute(query.limit(limit+1)).mappings().all()]


def report_provenance(kind: str, rows: list[dict], source_note: str | None) -> str:
    """Nunca atribuir IGP por defecto a filas recibidas sin validar origen.

    El endpoint de producción pasa una nota IGP solo tras restringir la consulta;
    consumidores internos de los renderizadores conservan la fuente real.
    """
    if source_note:
        return source_note
    origins = sorted({str(row['fuente']) for row in rows if row.get('fuente')})
    if origins:
        return 'Fuentes según registros: ' + ', '.join(origins)
    return 'Procedencia: consultar el dataset y los registros de origen'


IGP_REPORT_NOTES = {
    'events': 'Fuente: IGP/CENSIS · sismos observados · corte UTC',
    'alerts': 'Fuente: IGP/CENSIS · alertas asociadas a eventos observados · corte UTC',
    'sources': 'Fuente: IGP/CENSIS · estado de la fuente · corte UTC',
    'quality': 'Fuente: IGP/CENSIS · datasets con snapshots verificados · corte UTC',
    'models': 'Fuente: IGP/CENSIS · modelos entrenados con datasets verificados · corte UTC',
}


def report_title(kind: str, cutoff: datetime) -> str:
    return f'Sistema de Monitoreo Sísmico · {KINDS[kind]} · {cutoff.strftime("%Y-%m-%d %H:%M UTC")}'


def render_csv(kind: str, rows: list[dict], cutoff: datetime, source_note: str | None = None) -> bytes:
    buff = StringIO(newline='')
    writer = csv.writer(buff)
    writer.writerow(['# ' + report_title(kind, cutoff)])
    writer.writerow(['# '+report_provenance(kind, rows, source_note)])
    writer.writerow([label for _,label in COLUMNS[kind]])
    for row in rows:
        writer.writerow([csv_cell(report_cell(kind, row, key)) for key,_ in COLUMNS[kind]])
    return ('\ufeff' + buff.getvalue()).encode('utf-8')


def render_xlsx(kind: str, rows: list[dict], cutoff: datetime, source_note: str | None = None) -> bytes:
    """XLSX OOXML sin fórmulas, macros, vínculos externos ni dependencias pesadas."""
    def cell(addr: str, value: str, style: int = 0) -> str:
        # inlineStr: Excel interpreta los valores como texto, incluso si empiezan por '='.
        content = xml_escape(value, {'"':'&quot;'})
        return f'<c r="{addr}" t="inlineStr" s="{style}"><is><t xml:space="preserve">{content}</t></is></c>'
    def column(index: int) -> str:
        result = ''
        while index:
            index, rem = divmod(index - 1, 26)
            result = chr(65 + rem) + result
        return result
    count = len(COLUMNS[kind])
    data = ['<row r="1">' + cell('A1',report_title(kind, cutoff),1) + '</row>',
            '<row r="2">' + cell('A2',report_provenance(kind, rows, source_note),0) + '</row>',
            '<row r="3">' + cell('A3',f'Filas: {len(rows)} · Fecha de corte: {cutoff.isoformat()}') + '</row>']
    data.append('<row r="5">' + ''.join(cell(f'{column(i)}5',label,2)
                   for i,(_,label) in enumerate(COLUMNS[kind],1)) + '</row>')
    for number,row in enumerate(rows,6):
        data.append(f'<row r="{number}">' + ''.join(
            cell(f'{column(i)}{number}',normalize(report_cell(kind, row, key)))
            for i,(key,_) in enumerate(COLUMNS[kind],1)) + '</row>')
    widths = ''.join(f'<col min="{i}" max="{i}" width="{45 if i in (1,7,8,9) else 22}" customWidth="1"/>'
                     for i in range(1,count+1))
    sheet = ('<?xml version="1.0" encoding="UTF-8"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             f'<cols>{widths}</cols><sheetData>{"".join(data)}</sheetData>'
             f'<autoFilter ref="A5:{column(count)}{max(5,5+len(rows))}"/>'
             '</worksheet>')
    styles = ('<?xml version="1.0" encoding="UTF-8"?>'
              '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
              '<fonts count="3"><font><sz val="11"/><name val="Aptos"/></font>'
              '<font><b/><sz val="14"/><color rgb="FFFFFFFF"/></font>'
              '<font><b/><color rgb="FFFFFFFF"/></font></fonts>'
              '<fills count="3"><fill><patternFill patternType="none"/></fill>'
              '<fill><patternFill patternType="gray125"/></fill>'
              '<fill><patternFill patternType="solid"><fgColor rgb="FF12304D"/></patternFill></fill></fills>'
              '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
              '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
              '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
              '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
              '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
              '</styleSheet>')
    memory=BytesIO()
    with ZipFile(memory,'w',ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            '</Types>')
        archive.writestr('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>')
        archive.writestr('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Reporte" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '</Relationships>')
        archive.writestr('xl/worksheets/sheet1.xml',sheet)
        archive.writestr('xl/styles.xml',styles)
    return memory.getvalue()


def render_pdf(kind: str, rows: list[dict], cutoff: datetime, source_note: str | None = None) -> bytes:
    """PDF landscape paginado, sin ruta pública ni contenido editable del cliente."""
    output=BytesIO()
    doc=SimpleDocTemplate(output,pagesize=landscape(A4),leftMargin=13*mm,
                          rightMargin=13*mm,topMargin=15*mm,bottomMargin=15*mm)
    styles=getSampleStyleSheet()
    small=ParagraphStyle('small-report',parent=styles['Normal'],fontSize=6.5,leading=8,textColor=colors.HexColor('#172A42'))
    title=ParagraphStyle('report-title',parent=styles['Title'],fontSize=16,textColor=colors.HexColor('#12304D'),alignment=TA_LEFT)
    content=[Paragraph(xml_escape(KINDS[kind]),title),
             Paragraph(f'Sistema de Monitoreo Sísmico · Corte: {cutoff.isoformat()} · Registros: {len(rows)}',styles['Normal']),
             Paragraph('Datos de sismos observados y reportados. No constituye predicción ni alerta temprana.',styles['Normal']),
             Paragraph(xml_escape(report_provenance(kind, rows, source_note)),styles['Normal']),
             Spacer(1,6*mm)]
    if kind == 'events' and rows:
        # Gráfico sencillo, descrito con fuente y fecha de corte; no inventa datos.
        from reportlab.graphics.shapes import Drawing, Rect, String
        # Mismos umbrales del mapa: se incluyen valores faltantes y magnitudes < 2.
        # El conteo es exhaustivo: la suma de los cuatro rangos = len(rows).
        counts = {label: 0 for label, _ in MAGNITUDE_BANDS}
        for row in rows:
            counts[magnitude_band(row.get('magnitud'))] += 1
        drawing = Drawing(560, 115)
        drawing.add(String(0, 105, 'Eventos IGP/CENSIS por rango de magnitud · corte UTC', fontSize=9))
        drawing.add(String(0, 91, 'Colores descriptivos: no representan daños, intensidad ni peligro oficial.', fontSize=7))
        maximum = max(counts.values()) or 1
        for index, (label, hex_color) in enumerate(MAGNITUDE_BANDS):
            y = 70 - index * 19
            amount = counts[label]
            drawing.add(String(0, y + 3, label, fontSize=8))
            drawing.add(Rect(100, y, amount / maximum * 310, 12,
                             fillColor=colors.HexColor(hex_color), strokeColor=None))
            drawing.add(String(420, y + 3, str(amount), fontSize=8))
        content.extend([drawing, Spacer(1, 3 * mm)])
    # Resúmenes descriptivos: se grafican conteos o cantidades comparables,
    # nunca métricas ML heterogéneas ni probabilidades de sismos futuros.
    if kind != 'events' and rows:
        from collections import Counter
        from reportlab.graphics.shapes import Drawing, Rect, String
        bars = []
        chart_title = ''
        if kind == 'alerts':
            chart_title = 'Alertas por estado (registros exportados · corte UTC)'
            bars = list(Counter(str(r.get('estado') or 'Sin estado') for r in rows).most_common(5))
        elif kind == 'models':
            chart_title = 'Experimentos por algoritmo (registros exportados · corte UTC)'
            bars = list(Counter(str(r.get('algoritmo') or 'Sin algoritmo') for r in rows).most_common(5))
        elif kind == 'quality':
            chart_title = 'Filas por dataset (registros exportados · corte UTC)'
            bars = sorted(((f"{r.get('dataset', 'Dataset')} v{r.get('version', '—')}",
                            max(0, int(r.get('filas') or 0))) for r in rows),
                          key=lambda item: item[1], reverse=True)[:5]
        elif kind == 'sources' and len(rows) > 1:
            chart_title = 'Fuentes por estado (registros exportados · corte UTC)'
            bars = list(Counter(str(r.get('estado') or 'Sin estado') for r in rows).most_common(5))
        if bars and any(value > 0 for _, value in bars):
            drawing = Drawing(560, 22 + 19 * len(bars))
            drawing.add(String(0, 12 + 19 * len(bars), chart_title, fontSize=9))
            maximum = max(value for _, value in bars)
            for index, (label, amount) in enumerate(bars):
                y = 19 * (len(bars) - index - 1)
                # Truncar etiquetas largas; el detalle íntegro queda en la tabla.
                name = str(label)[:22] + ('…' if len(str(label)) > 22 else '')
                drawing.add(String(0, y + 3, name, fontSize=8))
                drawing.add(Rect(175, y, (amount / maximum) * 260, 12,
                                 fillColor=colors.HexColor('#228DB4'), strokeColor=None))
                drawing.add(String(445, y + 3, str(amount), fontSize=8))
            content.extend([drawing, Spacer(1, 3 * mm)])
    fields=COLUMNS[kind]
    # Anchos homogéneos: columnas muy largas se recortan con signo de elipsis.
    available=landscape(A4)[0]-26*mm
    width=available/len(fields)
    header=[Paragraph(xml_escape(label),small) for _,label in fields]
    records=[header]
    for row in rows:
        records.append([Paragraph(xml_escape(normalize(report_cell(kind, row, key))[:90]),small) for key,_ in fields])
    table=PDFTable(records,colWidths=[width]*len(fields),repeatRows=1,hAlign='LEFT')
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#DCEAF1')),
                               ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F4F8FA')]),
                               ('VALIGN',(0,0),(-1,-1),'TOP'),('BOTTOMPADDING',(0,0),(-1,-1),5),
                               ('TOPPADDING',(0,0),(-1,-1),5),('LINEBELOW',(0,0),(-1,0),0.4,colors.HexColor('#BACBD6'))]))
    content.append(table)
    def page_number(canvas, document):
        canvas.setFont('Helvetica',7)
        canvas.setFillColor(colors.HexColor('#537081'))
        canvas.drawString(13*mm,9*mm,f'Corte UTC: {cutoff.isoformat()} | Procedencia: ver encabezado')
        canvas.drawRightString(landscape(A4)[0]-13*mm,9*mm,f'Página {document.page}')
    doc.build(content,onFirstPage=page_number,onLaterPages=page_number)
    return output.getvalue()


def render_file(kind: str, format_: str, rows: list[dict], cutoff: datetime, source_note: str | None = None) -> tuple[bytes,str]:
    renders = {'csv':(render_csv,'text/csv; charset=utf-8'),
               'xlsx':(render_xlsx,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
               'pdf':(render_pdf,'application/pdf')}
    if format_ not in renders or kind not in KINDS:
        raise ValueError('Tipo/formato de reporte desconocido')
    factory,media = renders[format_]
    return factory(kind,rows,cutoff,source_note),media


def checksum(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()
