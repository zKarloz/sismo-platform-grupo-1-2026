"""Indicadores de calidad con reglas técnicas, no evaluación de peligrosidad.

Campos opcionales vacíos se informan como faltantes; no se imputan ni se
inventan datos. La unicidad se mide dentro de una fuente, NO entre fuentes.
"""

from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math

OPTIONAL = ("magnitude", "depth_km", "magnitude_type", "place", "source_updated_at")


def canonical_json(rows: list[dict]) -> str:
    """Serializa con orden determinista para verificar integridad entre ejecuciones."""
    return json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def content_sha256(rows: list[dict]) -> str:
    return hashlib.sha256(canonical_json(rows).encode("utf-8")).hexdigest()


def normalize_time(value: datetime | None) -> str | None:
    """SQL UTC (PostgreSQL) y sqlite naive en pruebas se serializan igual."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def snapshot_record(row: dict) -> dict:
    """Congela atributos usados por análisis y trazabilidad de fuente."""
    columns = ("id", "source_id", "source_name", "external_id", "occurred_at", "latitude",
               "longitude", "magnitude", "magnitude_type", "depth_km", "place", "source_url",
               "source_updated_at", "review_status", "received_at", "updated_at")
    record = {}
    for key in columns:
        value = row.get(key)
        if isinstance(value, datetime):
            value = normalize_time(value)
        elif key in {"id", "source_id"} and value is not None:
            value = str(value)
        record[key] = value
    return record


def quality_report(rows: list[dict], checked_at: datetime | None = None) -> dict:
    """Informe de snapshot COMPLETO (máximo 5000 filas) sin descartar registros.

    Reglas de rango = comprobaciones de coherencia del esquema, no límites
    científicos universales para magnitud ni profundidad.
    """
    checked_at = checked_at or datetime.now(timezone.utc)
    now_limit = checked_at + timedelta(minutes=5)
    missing = Counter({field: 0 for field in OPTIONAL})
    seen = set()
    duplicates = invalid = future = ready = 0
    source_counts: Counter[str] = Counter()
    times: list[datetime] = []
    for record in rows:
        for field in OPTIONAL:
            if record.get(field) is None or record.get(field) == "":
                missing[field] += 1
        key = (record.get("source_id"), record.get("external_id"))
        if key in seen:
            duplicates += 1
        seen.add(key)
        source_counts[str(record.get("source_name") or "Desconocida")] += 1
        latitude, longitude = record.get("latitude"), record.get("longitude")
        magnitude, depth = record.get("magnitude"), record.get("depth_km")
        def valid_number(value: object, low: float, high: float, optional: bool = False) -> bool:
            return value is None and optional or (
                isinstance(value, (int, float)) and not isinstance(value, bool)
                and math.isfinite(value) and low <= value <= high
            )
        coherent = (valid_number(latitude, -90, 90) and valid_number(longitude, -180, 180)
                    and valid_number(magnitude, -3, 12, optional=True)
                    and valid_number(depth, -20, 1000, optional=True)
                    and bool(record.get("external_id")) and bool(record.get("source_url")))
        if not coherent:
            invalid += 1
        when = record.get("occurred_at")
        try:
            occurred = datetime.fromisoformat(when) if isinstance(when, str) else when
            if occurred.tzinfo is None:
                occurred = occurred.replace(tzinfo=timezone.utc)
            times.append(occurred)
            if occurred > now_limit:
                future += 1
        except (ValueError, TypeError, AttributeError):
            invalid += 1
        if coherent and magnitude is not None and depth is not None:
            ready += 1
    return {
        "checked_at": normalize_time(checked_at), "total": len(rows),
        "missing": dict(missing), "duplicates_within_source": duplicates,
        "out_of_range_or_invalid": invalid, "future_events": future,
        "complete_magnitude_depth": ready,
        "min_occurred_at": normalize_time(min(times)) if times else None,
        "max_occurred_at": normalize_time(max(times)) if times else None,
        "by_source": dict(sorted(source_counts.items())),
        "status": "review" if invalid or duplicates or future else ("missing_values" if any(missing.values()) else "ok"),
        "method": "Rangos de integridad, completitud y duplicados (source_id, external_id); no imputación ni predicción.",
    }
