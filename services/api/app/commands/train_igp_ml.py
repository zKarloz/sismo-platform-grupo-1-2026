"""CLI autorizada: valida o entrena IGP instrumental sin utilizar 2025.

Ejecutar desde services/api: python -m app.commands.train_igp_ml --dataset-id UUID --check-only
Escrituras SOLO con --commit; no existe ruta HTTP para iniciar entrenamiento.
"""
import argparse
import json
from uuid import UUID

from app.db.session import get_engine
from app.ml.igp_experiments import inspection, train_igp


def main():
    parser = argparse.ArgumentParser(description='Laboratorio IGP retrospectivo 2019–2024')
    parser.add_argument('--dataset-id', type=lambda raw: str(UUID(raw)), required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--check-only', action='store_true', help='Valida snapshot sin entrenar ni escribir')
    group.add_argument('--commit', action='store_true', help='Entrena y guarda ocho métricas versionadas')
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    try:
        engine = get_engine()
        if args.check_only:
            print(json.dumps(inspection(engine, args.dataset_id), ensure_ascii=False, indent=2))
            print('VISTA PREVIA: no se entrenó ni escribió en Supabase.')
        else:
            result = train_igp(engine, args.dataset_id, seed=args.seed)
            print(json.dumps({'batch_id': result['batch_id'], 'dataset_id': args.dataset_id,
                              'counts': result['inspection']['counts'],
                              'results': [{'algorithm': r['algorithm'], 'target': r['target_name'],
                                           'metrics': {k: v for k, v in r['metrics'].items()
                                                       if k in ('mae', 'rmse', 'r2', 'macro_f1', 'accuracy')}}
                                          for r in result['experiments']]}, ensure_ascii=False, indent=2))
            print('OK: 8 experimentos guardados. 2025 sigue reservado.')
    except (ValueError, RuntimeError) as error:
        parser.exit(2, f'Validación fallida: {error}\n')
    except ImportError:
        parser.exit(2, 'Falta scikit-learn: pip install -r ../ml/requirements.txt\n')
    except Exception as error:
        parser.exit(1, f'Error ({type(error).__name__}); revisar migración ML_IGP_01 y DATABASE_URL.\n')


if __name__ == '__main__':
    main()
