"""Lectura controlada de reportes oficiales IGP publicados en ArcGIS REST.

No asume que la capa se actualiza inmediatamente tras cada sismo.
Las marcas temporales 'hora' y 'hora_local' se interpretan en America/Lima.
Las respuestas sin un contrato conocido se rechazan: no inventamos eventos.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from math import isfinite
from typing import Any
from zoneinfo import ZoneInfo

import httpx

IGP_BASE = "https://ide.igp.gob.pe/arcgis/rest/services/monitoreocensis"
IGP_REPORTS = f"{IGP_BASE}/SismosReportados/MapServer/0/query"
IGP_LATEST = f"{IGP_BASE}/UltimoSismo/MapServer/0/query"
IGP_REPORTS_PAGE = "https://ultimosismo.igp.gob.pe/productos/reportes-sismicos"
LIMA = ZoneInfo("America/Lima")


class IGPFeedError(ValueError):
    """El servicio devolvió una estructura o un registro no interpretable."""


class IGPUnavailable(RuntimeError):
    """El servicio oficial no respondió dentro del tiempo permitido."""


class IGPQueryResult(list):
    """Lista compatible con la API existente, con diagnóstico de filas descartadas.

    Estos metadatos son para la ingesta. No modifican el JSON público de IGP.
    """

    def __init__(self, records: list[dict], *, total: int, skipped: list[str]):
        super().__init__(records)
        self.total = total
        self.skipped = skipped


def _report_date(attrs: dict[str, Any]) -> date:
    """Usar fechaevento si es válida; en caso contrario intentar fecha.

    No se infiere una fecha a partir del reloj actual ni del OBJECTID.
    """
    for field in ("fechaevento", "fecha"):
        try:
            return _date(attrs.get(field))
        except IGPFeedError:
            pass
    raise IGPFeedError("Fecha IGP inválida o ausente")


def _date(value: Any) -> date:
    """Extrae la fecha de un campo ArcGIS Date, ISO o DD/MM/AAAA.

    En la capa «Sismos Reportados», `fechaevento` representa un instante
    ArcGIS en milisegundos UTC; para obtener el día de origen hay que
    convertirlo primero a America/Lima. Extraer `.date()` en UTC adelanta
    un día los eventos peruanos posteriores a las 19:00.

    Después combinamos el día local con el campo independiente `hora`.
    Las fechas en texto sin zona horaria se interpretan como fechas locales.
    """
    if isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).astimezone(LIMA).date()
    if isinstance(value, str):
        raw = value.strip()
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
            try:
                return datetime.strptime(raw[:10], fmt).date()
            except ValueError:
                continue
    raise IGPFeedError("Fecha IGP inválida o ausente")


def _time(value: Any) -> time:
    if not isinstance(value, str):
        raise IGPFeedError("Hora local IGP inválida o ausente")
    raw = value.strip()
    for fmt in ("%H:%M:%S", "%H:%M", "%I:%M:%S %p", "%I:%M %p"):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    raise IGPFeedError("Formato de hora local IGP desconocido")


def _float(value: Any, name: str, low: float, high: float, required: bool = True) -> float | None:
    if value is None or value == "":
        if not required:
            return None
        raise IGPFeedError(f"Falta {name}")
    if isinstance(value, bool):
        raise IGPFeedError(f"{name} inválido")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise IGPFeedError(f"{name} inválido") from exc
    if not isfinite(number) or not low <= number <= high:
        raise IGPFeedError(f"{name} fuera de rango")
    return number


def normalize(feature: dict[str, Any], feed: str) -> dict[str, Any]:
    """Normaliza eventos existentes: sin predicciones ni severidades artificiales."""
    if not isinstance(feature, dict) or not isinstance(feature.get("attributes"), dict):
        raise IGPFeedError("Feature ArcGIS inválido")
    attrs = feature["attributes"]
    geom = feature.get("geometry") or {}
    if feed == "recent":
        day = _report_date(attrs)
        clock = _time(attrs.get("hora"))
        latitude = _float(attrs.get("lat", geom.get("y")), "latitud", -90, 90)
        longitude = _float(attrs.get("lon", geom.get("x")), "longitud", -180, 180)
        depth = _float(attrs.get("prof"), "profundidad", -20, 1000, False)
        place = attrs.get("ref") or attrs.get("departamento")
        raw_id = attrs.get("code") or attrs.get("objectid")
        mag_type = None  # La capa no especifica escala normalizada.
    elif feed == "latest":
        day = _date(attrs.get("fecha_local"))
        clock = _time(attrs.get("hora_local"))
        latitude = _float(attrs.get("latitud", geom.get("y")), "latitud", -90, 90)
        longitude = _float(attrs.get("longitud", geom.get("x")), "longitud", -180, 180)
        depth = _float(attrs.get("profundidad"), "profundidad", -20, 1000, False)
        place = attrs.get("referencia") or attrs.get("ubicacion")
        raw_id = attrs.get("OBJECTID") or attrs.get("objectid")
        mag_type = None
    else:
        raise IGPFeedError("Tipo de feed no reconocido")

    if raw_id is None:
        raise IGPFeedError("Reporte sin identificador público")
    magnitude = _float(attrs.get("magnitud"), "magnitud", -3, 12, False)
    occurred_at = datetime.combine(day, clock, tzinfo=LIMA).astimezone(timezone.utc)
    return {
        "external_id": str(raw_id),
        "occurred_at": occurred_at.isoformat(),
        "latitude": latitude,
        "longitude": longitude,
        "magnitude": magnitude,
        "magnitude_type": mag_type,
        "depth_km": depth,
        "place": str(place).strip() if place else None,
        "source_name": "IGP/CENSIS",
        "source_url": IGP_REPORTS_PAGE,
    }


def query(feed: str, *, limit: int = 20, client: httpx.Client | None = None, strict: bool = False) -> list[dict[str, Any]]:
    """Realiza una consulta acotada sin tocar Supabase.

    El sitio puede actualizarse con retraso o cambiar de esquema. En ambos
    casos es preferible un error visible a mostrar datos supuestamente actuales.
    """
    if feed not in {"recent", "latest"} or not 1 <= limit <= 500:
        raise ValueError("Parámetros IGP inválidos")
    params = {
        "where": "1=1", "outFields": "*", "returnGeometry": "true",
        "outSR": "4326", "f": "json", "resultRecordCount": str(limit),
        "orderByFields": "fechaevento DESC,objectid DESC" if feed == "recent" else "objectid DESC",
    }
    if client is None:
        with httpx.Client(timeout=httpx.Timeout(12.0), follow_redirects=False) as session:
            return query(feed, limit=limit, client=session, strict=strict)
    try:
        response = client.get(IGP_REPORTS if feed == "recent" else IGP_LATEST, params=params)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise IGPUnavailable("No se pudo consultar el servicio oficial IGP") from exc
    if not isinstance(payload, dict) or "error" in payload:
        raise IGPUnavailable("El servicio IGP devolvió un error")
    features = payload.get("features")
    if not isinstance(features, list):
        raise IGPFeedError("La respuesta IGP no contiene features")
    results = []
    skipped: list[str] = []
    for item in features:
        # Los registros incompletos se excluyen para no mostrar horas inventadas.
        try:
            results.append(normalize(item, feed))
        except IGPFeedError as exc:
            if strict:
                raise
            # Registrar el motivo sin copiar campos libres del proveedor.
            attrs = item.get("attributes", {}) if isinstance(item, dict) else {}
            if not isinstance(attrs, dict):
                attrs = {}
            raw_id = str(attrs.get("code") or attrs.get("objectid") or "desconocido")
            safe_id = "".join(c for c in raw_id if c.isascii() and (c.isalnum() or c in "-_"))[:32]
            skipped.append(f"{safe_id or 'desconocido'}: {exc}")
            continue
    if features and not results:
        raise IGPFeedError("Ningún reporte IGP cumple el contrato esperado")
    results.sort(key=lambda x: x["occurred_at"], reverse=True)
    return IGPQueryResult(results, total=len(features), skipped=skipped)
