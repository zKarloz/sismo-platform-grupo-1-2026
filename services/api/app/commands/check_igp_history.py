"""Validación segura del histórico IGP 1960–2025, sin escritura en Supabase.

Ejemplo (terminal 3): python -m app.commands.check_igp_history --year 2024
"""
from __future__ import annotations

import argparse
import json

from app.igp.history_catalog import CatalogError, SOURCE_PAGE, CENSIS_PAGE, get_catalog, select_events


def main() -> int:
    parser = argparse.ArgumentParser(description='Comprobar catálogo instrumental oficial IGP')
    parser.add_argument('--year', type=int, default=2024, help='Año UTC 1960–2025')
    parser.add_argument('--refresh', action='store_true', help='Forzar lectura del origen')
    options = parser.parse_args()
    if not 1960 <= options.year <= 2025:
        parser.error('El año debe estar comprendido entre 1960 y 2025')
    try:
        resource = get_catalog(refresh=options.refresh)
    except CatalogError as error:
        print(json.dumps({'status':'error','reason':str(error),
                          'official_resource':SOURCE_PAGE}, ensure_ascii=False))
        return 1
    samples = select_events(resource,year_from=options.year,year_to=options.year)
    print(json.dumps({'status':'ok','year':options.year,'rows_in_year':len(samples),
                      'source_rows':resource.total_source,'invalid_rows':resource.skipped,
                      'snapshot_sha256':resource.sha256,
                      'retrieved_at_utc':resource.retrieved_at.isoformat(),
                      'stale':resource.stale,'source_mode':resource.source_mode,
                      'original_csv_sha256':resource.csv_sha256,
                      'original_xlsx_sha256':resource.xlsx_sha256,
                      'official_resource':CENSIS_PAGE if resource.source_mode == 'censis_xlsx_snapshot' else SOURCE_PAGE,
                      'sample':samples[:2]},ensure_ascii=False,indent=2))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
