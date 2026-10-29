"""Comprueba reconstrucción de predicciones reales sin tocar experimento original."""
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from test_ml_igp_historico_01 import engine, populate  # fixture aislada del parche 01
from app.commands.backfill_igp_predictions import replay_batch
from app.db.session import get_read_engine
from app.db.tables import ml_experiments, ml_validation_predictions, events
from app.ml.igp_experiments import train_igp
from app.routes.ml import router


def create_old_batch(engine):
    """Emula una corrida anterior al parche 02 (solo métricas en BD)."""
    dataset_id, _ = populate(engine)
    replay = train_igp(engine, dataset_id, seed=42, persist=False)
    batch_id = str(replay['experiments'][0]['batch_id'])
    with engine.begin() as conn:
        conn.execute(ml_experiments.insert(), [dict(r, id=uuid4()) for r in replay['experiments']])
    return dataset_id, batch_id


def test_backfill_has_no_side_effects_until_commit(engine):
    dataset_id, batch_id = create_old_batch(engine)
    check = replay_batch(engine, batch_id)
    assert check['metrics_match'] and not check['writes']
    assert check['rows_per_experiment'] == 45 and check['total_pairs'] == 360
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(ml_validation_predictions)).scalar_one() == 0
    done = replay_batch(engine, batch_id, commit=True)
    assert done['writes'] and not done['already_exists']
    assert replay_batch(engine, batch_id, commit=True)['already_exists']
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(ml_validation_predictions)).scalar_one() == 360
        assert conn.execute(select(func.count()).select_from(ml_experiments)).scalar_one() == 8
        assert conn.execute(select(func.count()).select_from(events)).scalar_one() == 0

    app = FastAPI()
    app.include_router(router, prefix='/api/v1')
    app.dependency_overrides[get_read_engine] = lambda: engine
    with engine.connect() as conn:
        reg_id = conn.execute(select(ml_experiments.c.id).where(
            ml_experiments.c.algorithm == 'LinearRegression-multiple')).scalar_one()
        knn_id = conn.execute(select(ml_experiments.c.id).where(
            ml_experiments.c.algorithm == 'KNN-binary-depth')).scalar_one()
    with TestClient(app) as client:
        r = client.get(f'/api/v1/ml/experiments/{reg_id}/predictions')
        assert r.status_code == 200, r.text
        assert r.json()['total'] == 45 and len(r.json()['items']) == 45
        assert all(item['occurred_at'].startswith('2024') for item in r.json()['items'])
        assert isinstance(r.json()['items'][0]['actual_value'], (float, int))
        k = client.get(f'/api/v1/ml/experiments/{knn_id}/predictions')
        assert k.status_code == 200 and len(k.json()['items']) == 45
        assert isinstance(k.json()['items'][0]['predicted_value'], str)
        assert client.get(f'/api/v1/ml/experiments/{knn_id}/predictions?page_size=1001').status_code == 422
        assert client.get(f'/api/v1/ml/experiments/{uuid4()}/predictions').json()['total'] == 0


def test_different_historic_metrics_abort_without_writes(engine):
    _, batch_id = create_old_batch(engine)
    with engine.begin() as conn:
        conn.execute(ml_experiments.update().where(
            ml_experiments.c.algorithm == 'KNN-binary-depth').values(metrics={'accuracy': 1.0}))
    with pytest.raises(ValueError, match='no coincide: metrics'):
        replay_batch(engine, batch_id, commit=True)
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(ml_validation_predictions)).scalar_one() == 0



def test_replay_detects_modified_existing_pair(engine):
    _, batch_id = create_old_batch(engine)
    replay_batch(engine, batch_id, commit=True)
    with engine.begin() as conn:
        sample = conn.execute(select(ml_validation_predictions).limit(1)).mappings().one()
        conn.execute(ml_validation_predictions.update().where(
            ml_validation_predictions.c.experiment_id == sample['experiment_id'],
            ml_validation_predictions.c.source_row == sample['source_row'])
            .values(predicted_value=9999))
    with pytest.raises(ValueError, match='diferentes'):
        replay_batch(engine, batch_id)


def test_new_training_writes_full_predictions_transactionally(engine):
    did, _ = populate(engine)
    result = train_igp(engine, did, seed=42)
    assert len(result['experiments']) == 8
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(ml_experiments)).scalar_one() == 8
        assert conn.execute(select(func.count()).select_from(ml_validation_predictions)).scalar_one() == 360
