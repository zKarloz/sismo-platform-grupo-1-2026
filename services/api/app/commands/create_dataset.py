"""Crea snapshots históricos desde Git Bash; no es una operación HTTP pública.

Ejemplo:
 python -m app.commands.create_dataset --name peru_usgs_v2 --source USGS --min-magnitude 2.5
"""

import argparse
from datetime import datetime

from app.db.session import get_engine
from app.quality.service import create_dataset
from app.routes.filters import SeismicFilters


def parse_datetime(raw: str | None):
    if raw is None:
        return None
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("Las fechas requieren UTC/offset: 2026-01-01T00:00:00+00:00")
    return dt


def main():
    parser = argparse.ArgumentParser(description="Congelar datos observados de Supabase en una versión inmutable")
    parser.add_argument("--name", required=True, help="Identificador ASCII sin espacios, p.ej. peru_usgs")
    parser.add_argument("--source", help="Nombre exacto, p.ej. USGS")
    parser.add_argument("--start", help="Instante ISO 8601 con offset")
    parser.add_argument("--end", help="Instante ISO 8601 con offset")
    parser.add_argument("--min-magnitude", type=float)
    parser.add_argument("--max-magnitude", type=float)
    parser.add_argument("--max-rows", type=int, default=1000)
    args = parser.parse_args()
    try:
        filters = SeismicFilters(start_time=parse_datetime(args.start), end_time=parse_datetime(args.end),
                                 min_magnitude=args.min_magnitude, max_magnitude=args.max_magnitude,
                                 source=args.source)
        if filters.start_time and filters.end_time and filters.start_time > filters.end_time:
            raise ValueError("Rango de fechas invertido")
        if filters.min_magnitude is not None and not -3 <= filters.min_magnitude <= 12:
            raise ValueError("Magnitud mínima fuera de rango")
        if filters.max_magnitude is not None and not -3 <= filters.max_magnitude <= 12:
            raise ValueError("Magnitud máxima fuera de rango")
        if (filters.min_magnitude is not None and filters.max_magnitude is not None
                and filters.min_magnitude > filters.max_magnitude):
            raise ValueError("Rango de magnitudes invertido")
        result = create_dataset(get_engine(), name=args.name, filters=filters, max_rows=args.max_rows)
    except (ValueError, RuntimeError) as exc:
        parser.exit(2, f"ERROR: {exc}\n")
    except Exception as exc:
        # No revelar URLs, contraseñas ni datos internos del driver en logs.
        parser.exit(1, f"ERROR en base de datos ({type(exc).__name__}). Verifica la migración 002 y DATABASE_URL.\n")
    print(f"OK · {result['name']} v{result['version']} · filas: {result['row_count']}")
    print(f"ID: {result['id']}\nSHA-256: {result['content_sha256']}")
    print(f"Calidad: {result['quality_report']['status']}")


if __name__ == "__main__":
    main()
