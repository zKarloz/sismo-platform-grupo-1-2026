"""Resumen real de Estimaciones; SQLite aislado, no consulta Supabase."""
from uuid import uuid4

from sqlalchemy import select
from test_ml_estimates_05 import client_for
from test_ml_igp_historico_01 import engine, populate
from app.db.tables import ml_experiments
from app.ml.igp_experiments import train_igp


def test_summary_counts_unique_events_not_model_rows(engine):
    dataset_id, _ = populate(engine)
    train_igp(engine, dataset_id)
    with client_for(engine) as client:
        response = client.get('/api/v1/ml/estimates/summary')
        assert response.status_code == 200, response.text
        summary = response.json()
        assert summary['total_estimates'] == 180
        assert summary['unique_events'] == 45
        assert summary['total_models'] == 4
        assert summary['year'] == 2024
        assert all(row['total'] == 45 for row in summary['models'])
        assert all('Dummy' not in row['algorithm'] for row in summary['models'])
        assert all(row['primary_metric'] == ('mae' if row['task_type'] == 'regression' else 'macro_f1')
                   for row in summary['models'])
        assert sum(row['task_type'] == 'classification' for row in summary['models']) == 2

        only_class = client.get('/api/v1/ml/estimates/summary?task_type=classification').json()
        assert only_class['total_models'] == 2
        assert only_class['total_estimates'] == 90
        assert only_class['unique_events'] == 45

        # El botón "Ver registros" debe filtrar desde el servidor, sin mezclar modelos.
        model = summary['models'][0]
        model_rows = client.get('/api/v1/ml/estimates', params={
            'experiment_id': model['experiment_id'], 'page_size': 10,
        })
        assert model_rows.status_code == 200
        assert model_rows.json()['total'] == 45
        assert all(row['experiment_id'] == model['experiment_id']
                   for row in model_rows.json()['items'])
        assert client.get('/api/v1/ml/estimates', params={
            'experiment_id': str(uuid4()),
        }).json()['total'] == 0
        assert client.post('/api/v1/ml/estimates/summary').status_code == 405


def test_summary_rejects_modified_hash_and_does_not_count_2025(engine):
    dataset_id, _ = populate(engine)
    train_igp(engine, dataset_id)
    with engine.begin() as conn:
        id_ = conn.execute(select(ml_experiments.c.id).where(
            ml_experiments.c.algorithm == 'KNN-binary-depth')).scalar_one()
        conn.execute(ml_experiments.update().where(ml_experiments.c.id == id_)
                     .values(dataset_sha256='invalid'))
    with client_for(engine) as client:
        summary = client.get('/api/v1/ml/estimates/summary').json()
        assert summary['total_models'] == 3
        assert summary['total_estimates'] == 3 * 45
        assert summary['unique_events'] == 45
