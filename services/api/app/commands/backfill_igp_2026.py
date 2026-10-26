"""Carga inicial y conciliación del IGP 2026 sin modificar datasets ML.

Ejemplos:
  python -m app.commands.backfill_igp_2026 --dry-run
  python -m app.commands.backfill_igp_2026 --apply

La misma operación es idempotente y puede ejecutarse diariamente.
"""
from __future__ import annotations

import argparse
import json

from app.igp.client import IGPQueryResult
from app.igp.year2026 import fetch_igp_year_2026
from app.ingestion.igp import sync_igp


def run(*, apply: bool = False, page_size: int = 200) -> dict:
    data = fetch_igp_year_2026(page_size=page_size)
    if not data:
        raise RuntimeError("El IGP no devolvió reportes válidos de 2026")
    summary = {"year": 2026, "seen": data.total, "valid": len(data), "skipped": len(data.skipped),
               "mode": "apply" if apply else "dry_run"}
    if not apply:
        return summary

    # sync_igp limita cada lote a 500; reutilizamos su UPSERT idempotente y
    # ingestion_runs. Conservar las omisiones de fuente en el último lote.
    added = updated = unchanged = 0
    results = []
    pages = [data[start:start + page_size] for start in range(0, len(data), page_size)]
    for index, records in enumerate(pages):
        skipped = data.skipped if index == len(pages) - 1 else []
        result = sync_igp(
            limit=len(records),
            fetch=lambda _limit, rows=records, skip=skipped: IGPQueryResult(
                rows, total=len(rows) + len(skip), skipped=skip,
            ),
        )
        added += result.inserted
        updated += result.updated
        unchanged += result.unchanged
        results.append(str(result.run_id))
    summary.update(inserted=added, updated=updated, unchanged=unchanged,
                   ingestion_runs=results, status="partial" if data.skipped else "success")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="IGP 2026: backfill y conciliación paginada")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Consulta sin escribir en Supabase")
    mode.add_argument("--apply", action="store_true", help="Escribe reportes válidos con UPSERT idempotente")
    parser.add_argument("--page-size", type=int, default=200)
    args = parser.parse_args()
    try:
        print(json.dumps(run(apply=args.apply, page_size=args.page_size), ensure_ascii=False, indent=2))
    except Exception as exc:
        # El nombre del error es suficiente para CI; nunca mostrar DB_URL/secrets.
        parser.exit(1, f"IGP 2026: {type(exc).__name__}; revisar disponibilidad/contrato del IGP.\n")


if __name__ == "__main__":
    main()
