"""CLI: python -m app.commands.sync_usgs --days 7 --min-magnitude 2.5."""

import argparse

from app.ingestion.service import sync_usgs


def main() -> None:
    parser = argparse.ArgumentParser(description="Sincronizar sismos USGS en Supabase (zona Perú + entorno)")
    parser.add_argument("--days", type=int, default=7, help="Ventana móvil: 1 a 90 días (defecto: 7)")
    parser.add_argument("--min-magnitude", type=float, default=2.5, help="Filtro inicial de USGS")
    args = parser.parse_args()
    try:
        result = sync_usgs(args.days, args.min_magnitude)
    except Exception as exc:
        # No imprimir detalles de SQLAlchemy que puedan contener datos internos.
        raise SystemExit(f"Sincronización fallida ({type(exc).__name__}). Revisar ingestion_runs.") from None
    print(f"OK · ejecución: {result.run_id}")
    print(f"Vistos: {result.seen} | Nuevos: {result.inserted} | Actualizados: {result.updated} | Sin cambios: {result.unchanged}")


if __name__ == "__main__":
    main()
