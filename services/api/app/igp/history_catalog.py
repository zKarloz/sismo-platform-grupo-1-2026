"""Catálogo histórico IGP 1960–2025: XLSX CENSIS, CSV oficial o API DKAN.

No escribe en seismic_events, datasets ni ml_experiments; nunca dispara alertas.
La descarga completa es bajo demanda y se cachea en memoria por proceso.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from io import StringIO, BytesIO
import csv
import os
from datetime import date, datetime, time, timedelta, timezone
from hashlib import sha256
from threading import RLock
import json
import math
import re
import unicodedata
from zipfile import ZipFile, BadZipFile
from xml.etree import ElementTree as ET

import httpx

RESOURCE = 'f9629081-0721-4101-a2c2-d0622e046f8b'
DATA_URL = 'https://www.datosabiertos.gob.pe/api/action/datastore/search.json'
SOURCE_PAGE = ('https://www.datosabiertos.gob.pe/dataset/catalogo-sismico/'
               'resource/f9629081-0721-4101-a2c2-d0622e046f8b')
CENSIS_PAGE = 'https://ultimosismo.igp.gob.pe/repositorio/datos-sismicos'
PUBLISHED_DATE = '2026-06-15'  # Fecha declarada por el portal; diferente de última consulta.
CACHE_TTL = timedelta(hours=12)
PAGE_SIZE = 2000
MAX_ROWS = 40000
MAX_CSV_BYTES = 16 * 1024 * 1024  # El recurso oficial anunciado mide ~1,26 MB.
# Fichero de respaldo, ajeno a PostgreSQL. Debe proceder del portal oficial.
DEFAULT_CSV_PATH = Path(__file__).resolve().parents[2] / 'data' / 'igp_catalogo_1960_2025.csv'
DEFAULT_XLSX_PATH = Path(__file__).resolve().parents[2] / 'data' / 'igp_catalogo_1960_2025.xlsx'
MAX_XLSX_BYTES = 12 * 1024 * 1024
MAX_XLSX_UNCOMPRESSED = 48 * 1024 * 1024
XLSX_NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
XLSX_HEADERS = ('fecha_utc', 'hora_utc', 'latitud', 'longitud', 'profundidad', 'magnitud')
CSV_FIELDS = {'ID', 'FECHA_UTC', 'HORA_UTC', 'LATITUD', 'LONGITUD', 'PROFUNDIDAD', 'MAGNITUD'}
_lock = RLock()
_cache: Catalog | None = None


class CatalogError(RuntimeError):
    """Error al consultar o interpretar el recurso histórico oficial."""


@dataclass(frozen=True)
class Catalog:
    events: tuple[dict, ...]
    retrieved_at: datetime
    sha256: str
    skipped: int
    total_source: int
    stale: bool = False
    # No confundir la fecha de lectura del archivo con una consulta viva al IGP.
    source_mode: str = 'datastore_api'
    csv_sha256: str | None = None
    xlsx_sha256: str | None = None


def normalize_row(row: dict) -> dict:
    """Interpreta FECHA_UTC(AAAAMMDD) y HORA_UTC(HHMMSS sin ceros iniciales).

    ID es un ordinal del archivo histórico, NO un código de reporte CENSIS.
    """
    try:
        date = str(row['FECHA_UTC']).strip().zfill(8)
        hour = str(row['HORA_UTC']).strip().zfill(6)
        dt = datetime.strptime(date + hour, '%Y%m%d%H%M%S').replace(tzinfo=timezone.utc)
        if dt.year < 1960 or dt.year > 2025:
            raise ValueError('fuera del periodo declarado')
        lat = float(str(row['LATITUD']).replace(',','.'))
        lon = float(str(row['LONGITUD']).replace(',','.'))
        depth = float(str(row['PROFUNDIDAD']).replace(',','.'))
        magnitude = float(str(row['MAGNITUD']).replace(',','.'))
        if not (all(math.isfinite(x) for x in (lat, lon, depth, magnitude))
                and -90 <= lat <= 90 and -180 <= lon <= 180 and 0 <= depth <= 900
                and 0 <= magnitude <= 10):
            raise ValueError('parámetros fuera de rango')
        identifier = str(row['ID']).strip()
        if not identifier or len(identifier) > 40:
            raise ValueError('ID histórico inválido')
    except (KeyError, TypeError, ValueError, OverflowError) as cause:
        raise ValueError('Fila histórica inválida') from cause
    return {'id': f'IGP-HIST-{identifier}', 'fecha_utc': dt.isoformat(),
            'magnitud': magnitude, 'profundidad_km': depth, 'latitud': lat,
            'longitud': lon, 'ubicacion': None, 'fuente': 'IGP / instrumental 1960–2025',
            'id_origen': identifier, 'url_origen': SOURCE_PAGE}


def _catalog_from_rows(rows: list[dict], *, source_mode: str,
                       csv_sha256: str | None = None,
                       xlsx_sha256: str | None = None) -> Catalog:
    """Validar el catálogo completo antes de hacerlo visible al frontend."""
    if not rows:
        raise CatalogError('El catálogo histórico oficial no contiene registros')
    if len(rows) > MAX_ROWS:
        raise CatalogError('El catálogo excede el límite de filas permitido')
    normalized = []
    skipped = 0
    for row in rows:
        try:
            event = normalize_row(row)
            if source_mode == 'censis_xlsx_snapshot':
                # XLSX no publica código individual: el número de fila es solo
                # una referencia local a esta versión exacta del archivo.
                sheet_row = int(row['__XLSX_ROW'])
                event.update(id=f'IGP-CENSIS-XLSX-R{sheet_row}',
                             id_origen=f'Fila {sheet_row}', url_origen=CENSIS_PAGE)
            normalized.append(event)
        except ValueError:
            skipped += 1
    if not normalized:
        raise CatalogError('Ninguna fila válida: revisar formato del catálogo')
    ids = [r['id_origen'] for r in normalized]
    if len(ids) != len(set(ids)):
        raise CatalogError('IDs duplicados en el catálogo oficial')
    normalized.sort(key=lambda item: (item['fecha_utc'], item['id_origen']), reverse=True)
    content = json.dumps(normalized, ensure_ascii=False, sort_keys=True,
                         separators=(',', ':'))
    return Catalog(events=tuple(normalized), retrieved_at=datetime.now(timezone.utc),
                   sha256=sha256(content.encode('utf-8')).hexdigest(),
                   skipped=skipped, total_source=len(rows),
                   source_mode=source_mode, csv_sha256=csv_sha256,
                   xlsx_sha256=xlsx_sha256)


def _read_official_csv(path: Path) -> Catalog:
    """Leer snapshot oficial sin modificar Supabase ni disparar alertas.

    Solo el operador configura el path. Se validan tamaño, encabezados y filas.
    """
    try:
        if not path.is_file():
            raise CatalogError('No se encontró el CSV histórico oficial configurado')
        if path.stat().st_size > MAX_CSV_BYTES:
            raise CatalogError('Archivo CSV demasiado grande; comprobar el recurso')
        data = path.read_bytes()
    except OSError as exc:
        raise CatalogError('No se pudo leer el archivo histórico configurado') from exc
    if not data or len(data) > MAX_CSV_BYTES:
        raise CatalogError('CSV histórico vacío o demasiado grande')
    try:
        content = data.decode('utf-8-sig')
    except UnicodeDecodeError:
        try:
            content = data.decode('latin-1')
        except UnicodeError as exc:
            raise CatalogError('Codificación CSV no compatible') from exc
    # El CSV oficial publica campos separados por coma. Soportar también punto y coma.
    first_line = content.splitlines()[0] if content.splitlines() else ''
    separator = ';' if first_line.count(';') > first_line.count(',') else ','
    reader = csv.DictReader(StringIO(content, newline=''), delimiter=separator)
    fields = {str(name).strip().lstrip('\ufeff').upper() for name in (reader.fieldnames or [])}
    if not CSV_FIELDS.issubset(fields):
        raise CatalogError('CSV ajeno al catálogo IGP: encabezados incompletos')
    rows = []
    for row in reader:
        # Sin modificar los valores: solo normalizar nombres de columnas.
        rows.append({str(key).strip().lstrip('\ufeff').upper(): value
                     for key, value in row.items() if key is not None})
        if len(rows) > MAX_ROWS:
            raise CatalogError('Demasiados registros en el CSV histórico')
    return _catalog_from_rows(rows, source_mode='official_csv_snapshot',
                              csv_sha256=sha256(data).hexdigest())


def _normalized_xlsx_header(value: str) -> str:
    """Normalizar encabezados como «latitud (º)» sin cambiar valores sísmicos."""
    plain = ''.join(character for character in unicodedata.normalize('NFKD', value.lower())
                    if not unicodedata.combining(character))
    plain = re.sub(r'[^a-z0-9]+', '_', plain).strip('_')
    for header in XLSX_HEADERS:
        if plain == header or plain.startswith(header + '_'):
            return header
    return plain


def _read_xlsx_strings(archive: ZipFile) -> list[str]:
    """Leer sharedStrings una sola vez; no se ejecutan macros ni fórmulas."""
    filename = 'xl/sharedStrings.xml'
    if filename not in archive.namelist():
        return []
    strings = []
    with archive.open(filename) as source:
        for _, element in ET.iterparse(source, events=('end',)):
            if element.tag == XLSX_NS + 'si':
                strings.append(''.join(child.text or '' for child in
                                       element.iter(XLSX_NS + 't')))
                element.clear()
                if len(strings) > 400000:
                    raise CatalogError('Demasiadas cadenas en el XLSX histórico')
    return strings


def _xlsx_cell_value(cell: ET.Element, strings: list[str]) -> str:
    kind = cell.get('t')
    if cell.find(XLSX_NS + 'f') is not None:
        raise CatalogError('XLSX con fórmulas; se requiere exportación de datos estáticos')
    if kind == 'inlineStr':
        inline = cell.find(XLSX_NS + 'is')
        return ''.join(node.text or '' for node in inline.iter(XLSX_NS + 't')) if inline is not None else ''
    value = cell.find(XLSX_NS + 'v')
    text = (value.text or '') if value is not None else ''
    if kind == 's':
        try:
            return strings[int(text)]
        except (ValueError, IndexError) as error:
            raise CatalogError('Índice de texto no válido en XLSX') from error
    return text


def _parse_xlsx_datetime(date_string: str, time_string: str) -> datetime:
    """Interpretar fecha y hora UTC exportadas por CENSIS (sin convertir a Lima)."""
    date_string = date_string.strip()
    time_string = time_string.strip()
    try:
        if re.fullmatch(r'\d+(?:\.\d+)?', date_string):
            day = (datetime(1899, 12, 30) + timedelta(days=float(date_string))).date()
        else:
            day = date.fromisoformat(date_string)
        if re.fullmatch(r'(?:0?\.\d+)', time_string):
            seconds = round(float(time_string) * 86400)
            clock = (datetime.min + timedelta(seconds=seconds)).time()
        else:
            clock = time.fromisoformat(time_string)
        moment = datetime.combine(day, clock, tzinfo=timezone.utc)
        if not 1960 <= moment.year <= 2025:
            raise ValueError('año fuera del período histórico')
        return moment
    except (ValueError, OverflowError) as cause:
        raise ValueError('Fecha u hora UTC no válida en XLSX') from cause


def _read_official_xlsx(path: Path) -> Catalog:
    """Importar snapshot CENSIS XLSX real; no escribir en PostgreSQL.

    Usamos exclusivamente ZIP/XML estándar de Python para no cargar dependencias
    de Excel en Render ni ejecutar contenido activo del archivo recibido.
    """
    try:
        if not path.is_file():
            raise CatalogError('No se encontró el XLSX CENSIS configurado')
        if not 0 < path.stat().st_size <= MAX_XLSX_BYTES:
            raise CatalogError('Tamaño XLSX histórico inválido')
        data = path.read_bytes()
        with ZipFile(BytesIO(data)) as book:
            components = [i for i in book.infolist() if i.filename.startswith('xl/')]
            if sum(i.file_size for i in components) > MAX_XLSX_UNCOMPRESSED:
                raise CatalogError('Contenido XLSX excesivamente grande')
            sheet_name = 'xl/worksheets/sheet1.xml'
            if sheet_name not in book.namelist():
                raise CatalogError('Falta la primera hoja del XLSX de CENSIS')
            strings = _read_xlsx_strings(book)
            rows: list[dict] = []
            headers: dict[str, int] | None = None
            with book.open(sheet_name) as source:
                for _, element in ET.iterparse(source, events=('end',)):
                    if element.tag != XLSX_NS + 'row':
                        continue
                    row_number = int(element.get('r', '0'))
                    cells: dict[int, str] = {}
                    for cell in element.findall(XLSX_NS + 'c'):
                        match = re.match(r'([A-Z]+)', cell.get('r', ''))
                        if not match:
                            continue
                        col = 0
                        for character in match.group(1):
                            col = col * 26 + ord(character) - ord('A') + 1
                        if col <= 24:
                            cells[col] = _xlsx_cell_value(cell, strings).strip()
                    element.clear()
                    if headers is None:
                        if not cells:
                            continue
                        mapping = {_normalized_xlsx_header(value): col for col, value in cells.items()}
                        if not set(XLSX_HEADERS).issubset(mapping):
                            raise CatalogError('XLSX no reconocido: faltan columnas CENSIS')
                        headers = {name: mapping[name] for name in XLSX_HEADERS}
                        continue
                    if not any(cells.values()):
                        continue
                    if len(rows) >= MAX_ROWS:
                        raise CatalogError('XLSX supera el máximo de registros permitido')
                    picked = {name: cells.get(col, '') for name, col in headers.items()}
                    try:
                        date_utc = _parse_xlsx_datetime(picked['fecha_utc'], picked['hora_utc'])
                        # Validación numérica y rangos por el normalizador existente.
                        rows.append({
                            'ID': f'XLSX-{row_number}', '__XLSX_ROW': row_number,
                            'FECHA_UTC': date_utc.strftime('%Y%m%d'),
                            'HORA_UTC': date_utc.strftime('%H%M%S'),
                            'LATITUD': picked['latitud'], 'LONGITUD': picked['longitud'],
                            'PROFUNDIDAD': picked['profundidad'],
                            'MAGNITUD': picked['magnitud'],
                        })
                    except ValueError:
                        # Contabilizar también errores de fecha en skipped, no borrarlos.
                        rows.append({'ID': f'XLSX-{row_number}', 'FECHA_UTC': 'INVALIDA'})
        return _catalog_from_rows(rows, source_mode='censis_xlsx_snapshot',
                                  xlsx_sha256=sha256(data).hexdigest())
    except CatalogError:
        raise
    except (OSError, BadZipFile, ET.ParseError, KeyError, ValueError, OverflowError) as cause:
        raise CatalogError('XLSX CENSIS no legible o con estructura incompatible') from cause


def _local_xlsx_path() -> Path | None:
    """Solo ruta privada del servidor; los usuarios no pueden elegir archivos."""
    configured = os.getenv('IGP_HISTORY_XLSX_PATH', '').strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return DEFAULT_XLSX_PATH if DEFAULT_XLSX_PATH.is_file() else None


def _local_csv_path() -> Path | None:
    """La variable opcional es una ruta privada del servidor, no un URL del cliente."""
    env_path = os.getenv('IGP_HISTORY_CSV_PATH', '').strip()
    if env_path:
        return Path(env_path).expanduser().resolve()
    return DEFAULT_CSV_PATH if DEFAULT_CSV_PATH.is_file() else None


def _read_source() -> Catalog:
    """Usar CSV oficial local si existe; de lo contrario paginar DKAN.

    El fallback evita que cada solicitud falle si la API del portal bloquea o
    interrumpe sus consultas. La página oficial permanece como referencia.
    """
    # Una elección explícita del operador tiene precedencia sobre archivos
    # autodetectados, para poder verificar ambas ediciones por separado.
    if os.getenv('IGP_HISTORY_XLSX_PATH', '').strip():
        return _read_official_xlsx(_local_xlsx_path())
    if os.getenv('IGP_HISTORY_CSV_PATH', '').strip():
        return _read_official_csv(_local_csv_path())
    xlsx_path = _local_xlsx_path()
    if xlsx_path is not None:
        return _read_official_xlsx(xlsx_path)
    local = _local_csv_path()
    if local is not None:
        return _read_official_csv(local)
    return _read_datastore_api()


def _read_datastore_api() -> Catalog:
    """Paginar hasta el total declarado; jamás aceptar datos truncados en silencio."""
    offset = 0
    raw_rows: list[dict] = []
    declared_total: int | None = None
    while offset < MAX_ROWS:
        try:
            response = httpx.get(DATA_URL, params={'resource_id':RESOURCE, 'limit':PAGE_SIZE,
                                                    'offset':offset},timeout=35,
                                 headers={'Accept':'application/json'})
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as cause:
            raise CatalogError('Portal de datos abiertos no disponible') from cause
        # DKAN devuelve {success:true,result:{records,total}}; rechazar cualquier
        # contrato inesperado en vez de mostrar cero sismos engañosamente.
        if not isinstance(payload,dict) or payload.get('success') is False:
            raise CatalogError('Respuesta DKAN rechazada')
        result = payload.get('result')
        if not isinstance(result,dict) or not isinstance(result.get('records'),list):
            raise CatalogError('Formato DKAN inesperado: falta result.records')
        rows = result['records']
        total = result.get('total')
        if isinstance(total,int) and not isinstance(total,bool) and total >= 0:
            if total > MAX_ROWS:
                raise CatalogError('Catálogo demasiado grande; no se truncará')
            declared_total = total
        if not rows:
            if declared_total is not None and len(raw_rows) < declared_total:
                raise CatalogError('Paginación incompleta del catálogo')
            break
        raw_rows.extend(rows)
        offset += len(rows)  # Algunos servidores reducen el límite solicitado.
        if declared_total is not None and len(raw_rows) >= declared_total:
            if len(raw_rows) != declared_total:
                raise CatalogError('Paginación inconsistente')
            break
        if len(raw_rows) >= MAX_ROWS:
            raise CatalogError('Límite de seguridad: catálogo incompleto')
        if declared_total is None and len(rows) < PAGE_SIZE:
            break
    if not raw_rows:
        raise CatalogError('El catálogo oficial no devolvió registros')
    if declared_total is not None and len(raw_rows) != declared_total:
        raise CatalogError('Total y filas descargadas no coinciden')
    return _catalog_from_rows(raw_rows, source_mode='datastore_api')


def get_catalog(*, refresh: bool = False) -> Catalog:
    """Usar caché 12h, o la última copia identificada si falla el portal.

    Bloqueo por proceso para evitar múltiples descargas concurrentes.
    """
    global _cache
    with _lock:
        if _cache and not refresh and datetime.now(timezone.utc)-_cache.retrieved_at < CACHE_TTL:
            return _cache
        try:
            _cache = _read_source()
        except CatalogError:
            if _cache is None:
                raise
            return Catalog(events=_cache.events,retrieved_at=_cache.retrieved_at,
                           sha256=_cache.sha256,skipped=_cache.skipped,
                           total_source=_cache.total_source,stale=True,
                           source_mode=_cache.source_mode,csv_sha256=_cache.csv_sha256,
                           xlsx_sha256=_cache.xlsx_sha256)
        return _cache


def select_events(catalog: Catalog, *, year_from: int, year_to: int,
                  start_at: datetime | None = None, end_at: datetime | None = None,
                  min_magnitude: float | None = None, max_depth: float | None = None,
                  south: float | None = None, west: float | None = None,
                  north: float | None = None, east: float | None = None) -> list[dict]:
    """Filtrar por intervalo exacto UTC, o por años para clientes anteriores.

    ``end_at`` es inclusivo. El frontend envía el último microsegundo del minuto
    elegido, evitando omitir eventos con segundos dentro del minuto final.
    Este catálogo histórico nunca ingresa a la tabla de alertas operativas.
    """
    selected = []
    precise = start_at is not None and end_at is not None
    if precise:
        lower = start_at.astimezone(timezone.utc)
        upper = end_at.astimezone(timezone.utc)
    for event in catalog.events:
        if precise:
            event_time = datetime.fromisoformat(event['fecha_utc'])
            if not lower <= event_time <= upper:
                continue
        else:
            year = int(event['fecha_utc'][:4])
            if not year_from <= year <= year_to:
                continue
        if min_magnitude is not None and event['magnitud'] < min_magnitude:
            continue
        if max_depth is not None and event['profundidad_km'] > max_depth:
            continue
        if south is not None and not (south <= event['latitud'] <= north
                                      and west <= event['longitud'] <= east):
            continue
        selected.append(event)
    return selected
