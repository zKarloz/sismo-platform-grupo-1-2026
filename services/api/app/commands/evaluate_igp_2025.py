"""CLI para cerrar una única prueba final 2025, previa aprobación del dataset.

Modo --check-only: no abre el Excel ni evalúa 2025.
Modo --commit: comprueba aprobación y reproduce 2024 ANTES de leer 2025.
"""
import argparse
import json
from uuid import UUID

from app.db.session import get_engine
from app.ml.igp_final import preflight, evaluate_once


def main():
    parser = argparse.ArgumentParser(description='Evaluación final única IGP 2025')
    parser.add_argument('--batch-id', required=True, type=lambda s: str(UUID(s)))
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check-only', action='store_true')
    mode.add_argument('--commit', action='store_true')
    args = parser.parse_args()
    try:
        result = (evaluate_once(get_engine(), args.batch_id) if args.commit
                  else preflight(get_engine(), args.batch_id))
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
        if not args.commit:
            print('VISTA PREVIA: prueba 2025 intacta, sin entrenamiento ni escritura.')
    except (ValueError, RuntimeError, ImportError) as exc:
        parser.exit(2, f'No se ejecutó la prueba final: {exc}\n')
    except Exception as exc:
        parser.exit(1, f'Error ({type(exc).__name__}); revisa DATABASE_URL, migración 012 y permisos.\n')


if __name__ == '__main__':
    main()
