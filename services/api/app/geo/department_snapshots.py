"""Carga de un snapshot referencial GeoJSON de departamentos del Perú.

No construye polígonos aproximados. Rechaza datasets incompletos o malformados;
los datos sísmicos se mantienen separados de esta cartografía.
"""

from __future__ import annotations

import hashlib
import json
import math
import unicodedata
from functools import lru_cache
from pathlib import Path

SNAPSHOT_PATH = Path(__file__).resolve().parents[2] / "data" / "peru_departamentos.geojson"
# Dataset reproducible derivado de cartografía INEI, publicado por Luis Rodas.
# El enlace se utiliza SOLO durante la preparación, nunca por cada usuario del mapa.
SOURCE_URL = (
    "https://raw.githubusercontent.com/Rodasluis/Peru-maps/main/"
    "salida/departamento_simplificado.geojson"
)
SOURCE_PAGE = "https://github.com/Rodasluis/Peru-maps"
EXPECTED_NAMES = frozenset({
    "AMAZONAS", "ANCASH", "APURIMAC", "AREQUIPA", "AYACUCHO", "CAJAMARCA",
    "CALLAO", "CUSCO", "HUANCAVELICA", "HUANUCO", "ICA", "JUNIN",
    "LA LIBERTAD", "LAMBAYEQUE", "LIMA", "LORETO", "MADRE DE DIOS",
    "MOQUEGUA", "PASCO", "PIURA", "PUNO", "SAN MARTIN", "TACNA",
    "TUMBES", "UCAYALI",
})
MAX_BYTES = 8_000_000


class InvalidDepartmentSnapshot(ValueError):
    """El archivo no contiene los límites administrativos esperados."""


def canonical_name(text: str) -> str:
    """Unifica acentos y espacios, sin cambiar identificadores oficiales."""
    if not isinstance(text, str):
        raise InvalidDepartmentSnapshot("Departamento sin nombre")
    ascii_name = "".join(
        char for char in unicodedata.normalize("NFD", text.upper())
        if unicodedata.category(char) != "Mn"
    )
    return " ".join(ascii_name.split())


def _checked_ring(ring: object) -> None:
    if not isinstance(ring, list) or len(ring) < 4:
        raise InvalidDepartmentSnapshot("Anillo poligonal incompleto")
    first = last = None
    for index, point in enumerate(ring):
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            raise InvalidDepartmentSnapshot("Coordenadas incompletas")
        lon, lat = point[:2]
        if any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in (lon, lat)):
            raise InvalidDepartmentSnapshot("Coordenadas no numéricas")
        if not (-84 <= lon <= -66 and -21 <= lat <= 2):
            raise InvalidDepartmentSnapshot("Coordenadas fuera del área geográfica de Perú")
        if index == 0:
            first = (lon, lat)
        last = (lon, lat)
    if first != last:
        raise InvalidDepartmentSnapshot("Anillo no cerrado")


def _checked_geometry(geometry: object) -> None:
    if not isinstance(geometry, dict):
        raise InvalidDepartmentSnapshot("Geometría ausente")
    kind, coords = geometry.get("type"), geometry.get("coordinates")
    if kind not in ("Polygon", "MultiPolygon") or not isinstance(coords, list) or not coords:
        raise InvalidDepartmentSnapshot("Solo se aceptan Polygon y MultiPolygon")
    polygons = [coords] if kind == "Polygon" else coords
    for polygon in polygons:
        if not isinstance(polygon, list) or not polygon:
            raise InvalidDepartmentSnapshot("Polígono sin contornos")
        for ring in polygon:
            _checked_ring(ring)


def validate_collection(raw: bytes) -> dict[str, dict]:
    """Exige exactamente 25 departamentos; nunca asigna polígonos por proximidad."""
    if len(raw) > MAX_BYTES:
        raise InvalidDepartmentSnapshot("GeoJSON demasiado grande")
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidDepartmentSnapshot("El archivo no es GeoJSON válido") from exc
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise InvalidDepartmentSnapshot("Se esperaba un FeatureCollection")
    features = payload.get("features")
    if not isinstance(features, list) or not features:
        raise InvalidDepartmentSnapshot("No existen departamentos en el archivo")
    by_name: dict[str, dict] = {}
    for feature in features:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise InvalidDepartmentSnapshot("Feature inválido")
        props = feature.get("properties")
        if not isinstance(props, dict):
            raise InvalidDepartmentSnapshot("Departamento sin atributos")
        name = canonical_name(
            props.get("nombre") or props.get("NOMBDEP") or props.get("NM_DEPA") or props.get("name")
        )
        if name not in EXPECTED_NAMES or name in by_name:
            raise InvalidDepartmentSnapshot(f"Departamento inesperado o duplicado: {name}")
        _checked_geometry(feature.get("geometry"))
        # Retener exclusivamente nombre y geometría: menos datos personales/metadata.
        by_name[name] = {
            "type": "Feature",
            "properties": {"nombre": name},
            "geometry": feature["geometry"],
        }
    missing = sorted(EXPECTED_NAMES - by_name.keys())
    if missing:
        raise InvalidDepartmentSnapshot("Faltan departamentos: " + ", ".join(missing))
    if len(by_name) != 25:
        raise InvalidDepartmentSnapshot("Se necesitan exactamente 25 departamentos")
    return by_name


@lru_cache(maxsize=3)
def _cached_snapshot(path: str, mtime_ns: int, length: int) -> tuple[dict[str, dict], str]:
    raw = Path(path).read_bytes()
    return validate_collection(raw), hashlib.sha256(raw).hexdigest()


def boundary_from_snapshot(code: str) -> dict | None:
    """Lee una copia local inmutable mientras su tamaño/mtime no cambien."""
    if not SNAPSHOT_PATH.is_file():
        return None
    stat = SNAPSHOT_PATH.stat()
    departments, digest = _cached_snapshot(str(SNAPSHOT_PATH), stat.st_mtime_ns, stat.st_size)
    feature = departments.get(code)
    if not feature:
        return None
    return {
        "department": code,
        "features": [feature],
        "source": SOURCE_PAGE,
        "source_mode": "snapshot_local_referencial",
        "sha256": digest,
        "scope": "limites_referenciales",
    }
