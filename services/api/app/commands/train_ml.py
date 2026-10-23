"""CLI privado de entrenamiento exploratorio: sin endpoints HTTP de escritura."""
import argparse
import json
from uuid import UUID

from app.db.session import get_engine
from app.ml.laboratory import experiment


def main():
    parser = argparse.ArgumentParser(description='Laboratorio retrospectivo: no pronostica terremotos')
    parser.add_argument('--dataset-id', type=lambda v: str(UUID(v)), required=True)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--test-ratio', type=float, default=0.20)
    parser.add_argument('--check-only', action='store_true', help='Valida clases y corte SIN entrenar ni escribir')
    args = parser.parse_args()
    try:
        result = experiment(get_engine(), args.dataset_id, seed=args.seed,
                            test_ratio=args.test_ratio, check_only=args.check_only)
    except (ValueError, RuntimeError) as exc:
        parser.exit(2, f'No se puede ejecutar: {exc}\n')
    except ImportError:
        parser.exit(2, 'Falta scikit-learn. Ejecuta pip install -r ../ml/requirements.txt\n')
    except Exception as exc:
        parser.exit(1, f'Error de laboratorio ({type(exc).__name__}); verificar migración 003 y DATABASE_URL.\n')
    print(json.dumps(result['inspection'], ensure_ascii=False, indent=2))
    if args.check_only:
        print('OK · Validación completada. No se entrenó ni guardó ningún experimento.')
    else:
        print(f'OK · batch_id: {result["batch_id"]}')
        for item in result['experiments']:
            print(f'{item["task_type"]} · {item["algorithm"]} · {item["metrics"]}')
        print('Cinco experimentos guardados en public.ml_experiments.')


if __name__ == '__main__':
    main()
