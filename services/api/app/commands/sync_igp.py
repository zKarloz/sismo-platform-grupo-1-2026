"""Comando privado para sincronización IGP, compatible con Render Cron Jobs.

Ejemplo: python -m app.commands.sync_igp --limit 200
No se ejecuta desde un endpoint de FastAPI ni inicia Uvicorn.
"""
import argparse
import sys

from app.ingestion.igp import sync_igp


def main() -> int:
    parser = argparse.ArgumentParser(description="IGP/CENSIS -> Supabase: ingesta de reportes observados")
    parser.add_argument("--limit", type=int, default=200, help="Hasta 500 reportes recientes")
    args = parser.parse_args()
    try:
        result = sync_igp(limit=args.limit)
    except Exception as exc:
        # Código 1 permite a Render registrar el trabajo como fallido.
        # El detalle controlado se consulta en ingestion_runs.error_summary.
        print(f"ERROR IGP: {type(exc).__name__}. Revisar ingestion_runs.", file=sys.stderr)
        return 1
    label = "PARCIAL" if result.status == "partial" else "OK"
    print(f"{label} · IGP/CENSIS · ejecución: {result.run_id}")
    print(f"Vistos: {result.seen} | Procesados: {result.processed} | "
          f"Omitidos: {result.skipped} | Nuevos: {result.inserted} | "
          f"Actualizados: {result.updated} | Sin cambios: {result.unchanged}")
    if result.skipped:
        print("AVISO: Algunos registros IGP fueron descartados; consultar "
              "ingestion_runs.error_summary. No usar el lote como catálogo completo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
