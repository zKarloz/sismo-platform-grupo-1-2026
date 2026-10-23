"""Consulta GeoJSON de USGS para el rectángulo Perú + entorno cercano.

El rectángulo incluye zonas de países vecinos: no equivale a un polígono
administrativo de Perú. Toda magnitud conserva su tipo original.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from math import isfinite
from time import sleep
from typing import Any

import httpx

USGS_QUERY_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"
PERU_BBOX = {
    "minlatitude": -19.5,
    "maxlatitude": 0.5,
    "minlongitude": -84.0,
    "maxlongitude": -68.0,
}


class USGSDataError(ValueError):
    """Una respuesta o registro de la fuente no cumple el contrato esperado."""


class USGSRequestError(RuntimeError):
    """USGS no respondió correctamente, tras los reintentos disponibles."""


@dataclass(frozen=True)
class USGSEvent:
    external_id: str
    occurred_at: datetime
    latitude: float
    longitude: float
    magnitude: float | None
    magnitude_type: str | None
    depth_km: float | None
    place: str | None
    source_url: str
    source_updated_at: datetime | None
    review_status: str


def epoch_millis(value: Any) -> datetime:
    """Convierte la marca temporal Unix de USGS (milisegundos) a UTC."""
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not isfinite(value):
        raise USGSDataError("Marca temporal USGS inválida")
    try:
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    except (ValueError, OverflowError, OSError) as exc:
        raise USGSDataError("Marca temporal USGS fuera de rango") from exc


def safe_float(value: Any, name: str, lo: float, hi: float, nullable: bool = False) -> float | None:
    """Rechaza NaN, infinitos y coordenadas fuera de rango."""
    if value is None and nullable:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise USGSDataError(f"{name} inválido")
    num = float(value)
    if not isfinite(num) or not lo <= num <= hi:
        raise USGSDataError(f"{name} fuera de rango")
    return num


def normalize_feature(feature: dict[str, Any]) -> USGSEvent:
    """Normaliza un Feature GeoJSON, con el esquema de la migración 001."""
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        raise USGSDataError("GeoJSON feature inválido")
    external_id = feature.get("id")
    properties = feature.get("properties")
    geometry = feature.get("geometry")
    if not isinstance(external_id, str) or not external_id.strip():
        raise USGSDataError("Evento sin identificador")
    if not isinstance(properties, dict) or not isinstance(geometry, dict):
        raise USGSDataError(f"Evento {external_id} sin propiedades o geometría")
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        raise USGSDataError(f"Evento {external_id} sin coordenadas")
    longitude = safe_float(coordinates[0], "longitud", -180, 180)
    latitude = safe_float(coordinates[1], "latitud", -90, 90)
    depth = safe_float(coordinates[2], "profundidad", -20, 1000, True) if len(coordinates) > 2 else None
    magnitude = safe_float(properties.get("mag"), "magnitud", -3, 12, True)
    link = properties.get("url")
    if not isinstance(link, str) or not link.startswith("https://earthquake.usgs.gov/"):
        raise USGSDataError(f"URL de procedencia inválida en {external_id}")
    updated = properties.get("updated")
    review = properties.get("status")
    return USGSEvent(
        external_id=external_id.strip(),
        occurred_at=epoch_millis(properties.get("time")),
        latitude=latitude,
        longitude=longitude,
        magnitude=magnitude,
        magnitude_type=properties.get("magType") or None,
        depth_km=depth,
        place=properties.get("place") or None,
        source_url=link,
        source_updated_at=epoch_millis(updated) if updated is not None else None,
        review_status="reviewed" if review == "reviewed" else "unreviewed",
    )


def fetch_usgs_events(
    start: datetime,
    end: datetime,
    min_magnitude: float = 2.5,
    *,
    page_size: int = 1000,
    max_pages: int = 10,
    client: httpx.Client | None = None,
) -> list[USGSEvent]:
    """Consulta páginas ordenadas ascendentemente; falla si el rango se trunca.

    El consumidor puede inyectar httpx.MockTransport en pruebas. Una respuesta
    204 se trata como lista vacía. 429/5xx reciben hasta 2 reintentos.
    """
    if start.tzinfo is None or end.tzinfo is None or start >= end:
        raise ValueError("Rango temporal UTC inválido")
    if not -3 <= min_magnitude <= 12:
        raise ValueError("Magnitud mínima fuera de rango")
    if not 1 <= page_size <= 20000 or max_pages < 1:
        raise ValueError("Paginación inválida")

    owns_client = client is None
    if client is None:
        client = httpx.Client(timeout=httpx.Timeout(25.0, connect=10.0), follow_redirects=False)
    result: dict[str, USGSEvent] = {}
    try:
        for index in range(max_pages):
            params = {
                "format": "geojson", "eventtype": "earthquake",
                "starttime": start.isoformat(timespec="seconds"),
                "endtime": end.isoformat(timespec="seconds"),
                "minmagnitude": min_magnitude,
                "orderby": "time-asc",
                "limit": page_size, "offset": index * page_size + 1,
                **PERU_BBOX,
            }
            for attempt in range(3):
                try:
                    response = client.get(USGS_QUERY_URL, params=params)
                    if response.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                        sleep(0.6 * 2**attempt)
                        continue
                    response.raise_for_status()
                    break
                except httpx.RequestError as exc:
                    if attempt == 2:
                        raise USGSRequestError("Fallo de red al consultar USGS") from exc
                    sleep(0.6 * 2**attempt)
                except httpx.HTTPStatusError as exc:
                    raise USGSRequestError(f"USGS devolvió HTTP {exc.response.status_code}") from exc
            if response.status_code == 204:
                break
            try:
                payload = response.json()
            except ValueError as exc:
                raise USGSDataError("USGS devolvió JSON inválido") from exc
            if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
                raise USGSDataError("USGS devolvió un GeoJSON inesperado")
            features = payload["features"]
            for feature in features:
                event = normalize_feature(feature)
                previous = result.get(event.external_id)
                if previous is None or (event.source_updated_at or event.occurred_at) > (previous.source_updated_at or previous.occurred_at):
                    result[event.external_id] = event
            if len(features) < page_size:
                return list(result.values())
        else:
            raise USGSDataError("Consulta excedió el máximo de páginas; reducir rango temporal")
        return list(result.values())
    finally:
        if owns_client:
            client.close()
