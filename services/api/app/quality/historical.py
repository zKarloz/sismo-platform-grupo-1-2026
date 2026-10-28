"""Preparación reproducible de un dataset de desarrollo IGP instrumental.

Solo 2019–2024, M >= 4.0. 2025 se reserva como prueba final y
no se lee a través de esta interfaz de datasets de desarrollo.
"""

from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from uuid import uuid4
import re

from sqlalchemy import func, select, text
from sqlalchemy.engine import Engine

from app.db.tables import datasets, historical_snapshot_rows
from app.igp.history_catalog import _read_official_xlsx
from app.quality.report import content_sha256, quality_report

DATASET_NAME = "igp_instrumental_2019_2024_m40"
SOURCE = "IGP/CENSIS"
KIND = "igp_instrumental_xlsx"
EXPECTED_XLSX_SHA256 = "51e75ba1032cef71adfbb780626c33f52fed8a430c12221271dfaed62ade09ca"
MAX_ROWS = 5000  # Limitación de datasets heredada de la migración 002.


def prepare_historical_dataset(path: Path, expected_xlsx_sha256: str = EXPECTED_XLSX_SHA256) -> dict:
    """Lee, valida y congela en memoria; no conecta a Supabase.

    La revisión del fichero se verifica antes de aceptar un dataset.
    No utiliza 2025 ni construye variables con información futura.
    """
    if not re.fullmatch(r"[0-9a-f]{64}", expected_xlsx_sha256):
        raise ValueError("SHA-256 esperado no válido")
    path = Path(path)
    if not path.is_file():
        raise ValueError("No existe el Excel histórico indicado")
    file_hash = sha256(path.read_bytes()).hexdigest()
    if file_hash != expected_xlsx_sha256:
        raise ValueError("SHA-256 del Excel distinto al revisado: no se importa ninguna fila")
    catalog = _read_official_xlsx(path)
    if catalog.source_mode != "censis_xlsx_snapshot" or catalog.xlsx_sha256 != file_hash:
        raise ValueError("No es un snapshot XLSX IGP verificable")
    if catalog.skipped:
        raise ValueError(f"El Excel contiene {catalog.skipped} filas inválidas: revisar antes de capturar")

    records = []
    for event in catalog.events:
        year = int(event["fecha_utc"][:4])
        if not 2019 <= year <= 2024 or event["magnitud"] < 4.0:
            continue
        match = re.fullmatch(r"IGP-CENSIS-XLSX-R(\d+)", event["id"])
        if not match:
            raise ValueError("ID de fila de Excel no verificable")
        records.append({
            "external_id": event["id"],  # Identificador de fila de esta edición, no ID CENSIS.
            "source_row": int(match.group(1)),
            "source_name": SOURCE,
            "occurred_at": event["fecha_utc"],
            "latitude": event["latitud"],
            "longitude": event["longitud"],
            "magnitude": event["magnitud"],
            "depth_km": event["profundidad_km"],
            "magnitude_type": None,
            "place": None,
            "source_url": event["url_origen"],
            "source_updated_at": None,
            "split": "train" if year <= 2023 else "validation",
        })
    records.sort(key=lambda r: (r["occurred_at"], r["source_row"]))
    splits = dict(Counter(r["split"] for r in records))
    if not records or len(records) > MAX_ROWS or not splits.get("train") or not splits.get("validation"):
        raise ValueError("Captura incompleta o superior a 5000 filas")
    if len({r["source_row"] for r in records}) != len(records):
        raise ValueError("Filas Excel duplicadas")
    if any(not 2019 <= int(r["occurred_at"][:4]) <= 2024 for r in records):
        raise ValueError("Una fila pertenece a un período de prueba reservado")

    report = quality_report(records)
    report.update({
        "by_split": splits,
        "essential_fields_missing": sum(any(r[f] is None for f in
            ("occurred_at", "latitude", "longitude", "magnitude", "depth_km")) for r in records),
        "raw_file_rows": catalog.total_source,
        "source_file_sha256": file_hash,
        "transformations": ["Filtro de años UTC 2019–2024", "Magnitud M >= 4.0",
                            "Orden cronológico UTC y fila física Excel", "Sin imputación ni filas sintéticas"],
        "limitations": "Magnitud sin escala identificada; no incluye localidad ni región; la clase profunda es escasa.",
    })
    spec = {
        "source": SOURCE, "dataset_kind": KIND,
        "source_file_sha256": file_hash,
        "source_file": path.name, "source_mode": catalog.source_mode,
        "source_url": "https://ultimosismo.igp.gob.pe/repositorio/datos-sismicos",
        "source_table": "public.igp_historical_dataset_snapshots",
        "period_utc": {"start": "2019-01-01T00:00:00+00:00", "end_exclusive": "2025-01-01T00:00:00+00:00"},
        "min_magnitude": 4.0, "split_rule": {"train": "2019–2023", "validation": "2024"},
        "holdout_test": "2025 reservado: no incorporado ni disponible en este dataset",
        "order": "occurred_at ASC, source_row ASC", "time_zone": "UTC",
        "capture_mode": "full_filtered_snapshot", "imputation": "none",
        "max_rows": MAX_ROWS,
    }
    return {"records": records, "query_spec": spec, "quality_report": report,
            "content_sha256": content_sha256(records), "row_count": len(records),
            "by_split": splits, "source_file_sha256": file_hash}


def persist_historical_dataset(engine: Engine, prepared: dict,
                               name: str = DATASET_NAME) -> dict:
    """Inserta metadatos y filas inmutables en una misma transacción.

    Reejecutar exactamente el mismo archivo/filtros no crea otra versión.
    No modifica datasets antiguos ni la tabla operativa seismic_events.
    """
    if name != DATASET_NAME:
        raise ValueError("Esta captura piloto requiere el nombre aprobado")
    records = prepared["records"]
    if content_sha256(records) != prepared["content_sha256"]:
        raise ValueError("La copia preparada cambió antes de persistir")
    if prepared["query_spec"]["dataset_kind"] != KIND or prepared["row_count"] != len(records):
        raise ValueError("Especificación de captura inconsistente")
    # Defensa adicional: el SQL y el importador también validan fuente y split.
    if (prepared["query_spec"].get("source") != SOURCE
        or prepared["query_spec"].get("min_magnitude") != 4.0
        or len(records) > MAX_ROWS
        or any(r.get("source_name") != SOURCE
                   or not 2019 <= int(r["occurred_at"][:4]) <= 2024
                   or r.get("split") != ("train" if int(r["occurred_at"][:4]) <= 2023 else "validation")
                   or r.get("magnitude", 0) < 4.0 for r in records)):
        raise ValueError("Datos de captura o partición temporal no autorizados")
    with engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:name))"), {"name": name})
        existing = conn.execute(select(datasets).where(datasets.c.name == name).order_by(datasets.c.version.desc())).mappings().all()
        for row in existing:
            if row["content_sha256"] == prepared["content_sha256"] and row["query_spec"] == prepared["query_spec"]:
                return {"id": str(row["id"]), "name": name, "version": row["version"],
                        "row_count": row["row_count"], "already_exists": True,
                        "content_sha256": row["content_sha256"], "by_split": prepared["by_split"]}
        version = max((row["version"] for row in existing), default=0) + 1
        dataset_id = uuid4()
        conn.execute(datasets.insert().values(
            id=dataset_id, name=name, version=version,
            query_spec=prepared["query_spec"], row_count=len(records),
            period_start=datetime(2019, 1, 1, tzinfo=timezone.utc),
            period_end=datetime(2024, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
            quality_report=prepared["quality_report"],
            content_sha256=prepared["content_sha256"],
            created_at=datetime.now(timezone.utc),
        ))
        for start in range(0, len(records), 250):
            conn.execute(historical_snapshot_rows.insert(), [
                {"dataset_id": dataset_id, "position": i + 1,
                 "source_row": r["source_row"], "split": r["split"], "record": r}
                for i, r in enumerate(records[start:start + 250], start)
            ])
    return {"id": str(dataset_id), "name": name, "version": version,
            "row_count": len(records), "already_exists": False,
            "content_sha256": prepared["content_sha256"], "by_split": prepared["by_split"]}
