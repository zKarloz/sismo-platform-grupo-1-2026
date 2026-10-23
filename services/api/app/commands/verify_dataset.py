"""Comprueba integridad de un snapshot previamente guardado en PostgreSQL."""

import argparse
from app.db.session import get_engine
from app.quality.service import verify_dataset


def main():
    parser = argparse.ArgumentParser(description="Verificar checksum SHA-256 de un dataset versionado")
    parser.add_argument("--id", required=True, help="UUID obtenido al crear el dataset")
    args = parser.parse_args()
    try:
        report = verify_dataset(get_engine(), args.id)
    except ValueError as exc:
        parser.exit(2, f"ERROR: {exc}\n")
    except Exception as exc:
        parser.exit(1, f"ERROR de verificación ({type(exc).__name__}).\n")
    print(f"Filas: {report['row_count']} · Conteo OK: {report['row_count_matches']} · SHA-256 OK: {report['hash_matches']}")
    if not report['row_count_matches'] or not report['hash_matches']:
        parser.exit(1, "ERROR: los datos guardados no coinciden con su manifiesto\n")


if __name__ == "__main__":
    main()
