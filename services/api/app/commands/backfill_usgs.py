"""Descarga histórico USGS por bloques limitados para ampliar datasets.

Ejemplo: python -m app.commands.backfill_usgs --start 2024-01-01 --end 2026-10-22
Cada bloque se registra como una ejecución en ingestion_runs; idempotente.
"""
import argparse
from datetime import date, datetime, time, timedelta, timezone

from app.ingestion.service import sync_usgs_range


def main():
    parser = argparse.ArgumentParser(description='Backfill histórico USGS: Perú y entorno rectangular')
    parser.add_argument('--start', type=date.fromisoformat, required=True, help='YYYY-MM-DD')
    parser.add_argument('--end', type=date.fromisoformat, required=True, help='YYYY-MM-DD exclusivo')
    parser.add_argument('--min-magnitude', type=float, default=2.5)
    parser.add_argument('--chunk-days', type=int, default=60)
    args = parser.parse_args()
    today = datetime.now(timezone.utc).date()
    if args.start >= args.end or args.end > today + timedelta(days=1):
        parser.error('Fechas inválidas o futuras; --end es exclusivo')
    if (args.end - args.start).days > 1096:
        parser.error('Máximo 1096 días por ejecución; divide por períodos')
    if not 1 <= args.chunk_days <= 90:
        parser.error('--chunk-days debe estar entre 1 y 90')
    start = datetime.combine(args.start, time.min, tzinfo=timezone.utc)
    final = datetime.combine(args.end, time.min, tzinfo=timezone.utc)
    totals = [0, 0, 0, 0]
    i = 0
    while start < final:
        end = min(start + timedelta(days=args.chunk_days), final)
        i += 1
        try:
            result = sync_usgs_range(start, end, args.min_magnitude)
        except Exception as exc:
            parser.exit(1, f'Falló bloque {i} ({start.date()} a {end.date()}): '
                           f'{type(exc).__name__}. Revisar ingestion_runs, reejecutar (es idempotente).\n')
        chunk = [result.seen, result.inserted, result.updated, result.unchanged]
        totals = [a+b for a,b in zip(totals, chunk)]
        print(f'Bloque {i}: {start.date()} → {end.date()} | '
              f'Vistos {chunk[0]}, nuevos {chunk[1]}, actualizados {chunk[2]}, sin cambios {chunk[3]}', flush=True)
        start = end
    print(f'OK · Totales: Vistos {totals[0]} | Nuevos {totals[1]} | '
          f'Actualizados {totals[2]} | Sin cambios {totals[3]}')


if __name__ == '__main__':
    main()
