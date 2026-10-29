"""Recupera predicciones de validación 2024 de una corrida IGP ya registrada.

Compara SHA del dataset, versión sklearn/numpy, parámetros y TODAS las métricas
antes de escribir. No crea experimentos ni usa 2025.

python -m app.commands.backfill_igp_predictions --batch-id UUID --check-only
python -m app.commands.backfill_igp_predictions --batch-id UUID --commit
"""
import argparse
import json
from datetime import timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.engine import Engine

from app.db.session import get_engine
from app.db.tables import datasets, ml_experiments, ml_validation_predictions
from app.ml.igp_experiments import train_igp, VERSION
from app.quality.historical import KIND, SOURCE


def replay_batch(engine: Engine, batch_id: str, *, commit: bool = False) -> dict:
    """Reproduce métricas de la corrida original; escribe solamente si coinciden."""
    bid = UUID(batch_id)
    with engine.connect() as conn:
        saved = conn.execute(select(ml_experiments).where(
            ml_experiments.c.batch_id == bid)).mappings().all()
    if len(saved) != 8:
        raise ValueError('La corrida debe tener exactamente ocho experimentos IGP')
    if len({r['dataset_id'] for r in saved}) != 1 or len({r['seed'] for r in saved}) != 1:
        raise ValueError('La corrida mezcla datasets o semillas')
    dataset_id, seed = str(saved[0]['dataset_id']), saved[0]['seed']
    with engine.connect() as conn:
        ds = conn.execute(select(datasets).where(
            datasets.c.id == saved[0]['dataset_id'])).mappings().one()
    if ds['query_spec'].get('source') != SOURCE or ds['query_spec'].get('dataset_kind') != KIND:
        raise ValueError('El lote no pertenece al catálogo IGP histórico')
    if any(r['dataset_sha256'] != ds['content_sha256'] or r['model_version'] != VERSION or
           not r['validation_spec'].get('test_2025_reserved') for r in saved):
        raise ValueError('Dataset, versión o reserva temporal inconsistentes')

    # Entrena SOLO EN MEMORIA para reconstruir los pares, sin crear una corrida nueva.
    replay = train_igp(engine, dataset_id, seed=seed, persist=False)
    expected = {r['algorithm']: r for r in replay['experiments']}
    if len(expected) != 8 or {r['algorithm'] for r in saved} != set(expected):
        raise ValueError('Algoritmos incompatibles con el lote guardado')
    for old in saved:
        candidate = expected[old['algorithm']]
        # Igualdad estricta: previene recrear curvas de un modelo diferente al guardado.
        for key in ('task_type', 'target_name', 'features', 'params', 'metrics', 'validation_spec'):
            if old[key] != candidate[key]:
                raise ValueError(f'La repetición de {old["algorithm"]} no coincide: {key}')

    counts = {r['algorithm']: len(replay['predictions'][r['algorithm']]) for r in saved}
    expected_count = replay['inspection']['counts']['validation']
    if len(set(counts.values())) != 1 or next(iter(counts.values())) != expected_count:
        raise ValueError('Predicciones incompletas respecto al dataset de validación')
    with engine.connect() as conn:
        already = conn.execute(select(func.count()).select_from(ml_validation_predictions)
            .where(ml_validation_predictions.c.experiment_id.in_([r['id'] for r in saved]))).scalar_one()
    if already not in (0, 8 * expected_count):
        raise ValueError('Almacenamiento parcial detectado: no se hará una carga incompleta')
    # En ejecuciones repetidas, no confiar únicamente en el conteo:
    # verificar los pares completos y su correspondencia con el modelo.
    if already:
        with engine.connect() as conn:
            stored = conn.execute(select(ml_validation_predictions).where(
                ml_validation_predictions.c.experiment_id.in_([r['id'] for r in saved]))).mappings().all()
        stored_by_experiment = {}
        for value in stored:
            stored_by_experiment[(value['experiment_id'], value['source_row'])] = value
        for experiment in saved:
            for expected_pair in replay['predictions'][experiment['algorithm']]:
                key = (experiment['id'], expected_pair['source_row'])
                present = stored_by_experiment.get(key)
                if (present is None or present['dataset_id'] != experiment['dataset_id'] or
                        present['split'] != 'validation' or
                        present['actual_value'] != expected_pair['actual_value'] or
                        present['predicted_value'] != expected_pair['predicted_value'] or
                        present['occurred_at'].replace(tzinfo=present['occurred_at'].tzinfo or timezone.utc).astimezone(timezone.utc) != expected_pair['occurred_at']):
                    raise ValueError('Predicciones almacenadas diferentes a la reproducción')
    if commit and already == 0:
        payload = [
            {'experiment_id': row['id'], 'dataset_id': row['dataset_id'], **pair}
            for row in saved for pair in replay['predictions'][row['algorithm']]
        ]
        with engine.begin() as conn:
            conn.execute(ml_validation_predictions.insert(), payload)
    return {'batch_id': batch_id, 'dataset_id': dataset_id,
            'experiments': len(saved), 'rows_per_experiment': expected_count,
            'total_pairs': 8 * expected_count, 'metrics_match': True,
            'already_exists': already == 8 * expected_count,
            'writes': commit and already == 0,
            'test_2025_reserved': True}


def main() -> None:
    parser = argparse.ArgumentParser(description='Reconstituir pares de validación IGP 2024')
    parser.add_argument('--batch-id', type=lambda v: str(UUID(v)), required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check-only', action='store_true')
    mode.add_argument('--commit', action='store_true')
    args = parser.parse_args()
    try:
        result = replay_batch(get_engine(), args.batch_id, commit=args.commit)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, RuntimeError) as exc:
        parser.exit(2, f'Validación fallida: {exc}\n')
    except ImportError:
        parser.exit(2, 'Falta scikit-learn: pip install -r ../ml/requirements.txt\n')
    except Exception as exc:
        parser.exit(1, f'Error de base de datos ({type(exc).__name__}); comprueba migración ML_IGP_02 y DATABASE_URL.\n')


if __name__ == '__main__':
    main()
