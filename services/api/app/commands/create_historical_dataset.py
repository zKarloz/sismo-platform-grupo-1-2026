"""CLI privilegiado para preparar un snapshot IGP instrumental sin HTTP público.

Por defecto NO escribe en PostgreSQL: es obligatorio pasar --commit.
"""
import argparse
import json
from pathlib import Path

from app.quality.historical import DATASET_NAME, EXPECTED_XLSX_SHA256, prepare_historical_dataset, persist_historical_dataset


def main():
    parser = argparse.ArgumentParser(description="Dataset IGP 2019–2024 M>=4; reserva 2025")
    parser.add_argument("--xlsx", type=Path, default=Path("data/igp_catalogo_1960_2025.xlsx"),
                        help="Ruta local al Excel oficial desde services/api")
    parser.add_argument("--expected-sha256", default=EXPECTED_XLSX_SHA256,
                        help="SHA-256 verificado del archivo de origen")
    parser.add_argument("--commit", action="store_true", help="Confirmar escritura en Supabase; sin esto solo vista previa")
    args = parser.parse_args()
    try:
        prepared = prepare_historical_dataset(args.xlsx, args.expected_sha256)
        summary = {"name": DATASET_NAME, "row_count": prepared["row_count"],
                   "by_split": prepared["by_split"], "source_file_sha256": prepared["source_file_sha256"],
                   "snapshot_sha256": prepared["content_sha256"], "writes": args.commit}
        if not args.commit:
            print(json.dumps(summary, indent=2, ensure_ascii=False))
            print("VISTA PREVIA: no se ha escrito en Supabase. Añade --commit después de aplicar la migración.")
            return
        from app.db.session import get_engine
        result = persist_historical_dataset(get_engine(), prepared)
        print(json.dumps({**summary, **result}, indent=2, ensure_ascii=False))
    except ValueError as error:
        parser.exit(2, f"Error de validación: {error}\n")
    except Exception as error:
        # No imprimir cadena de conexión ni secretos de SQLAlchemy.
        parser.exit(1, f"No se pudo persistir ({type(error).__name__}). Revisa DATABASE_URL y la migración histórica.\n")


if __name__ == "__main__":
    main()
