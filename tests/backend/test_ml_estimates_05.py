"""Revisión 05: solo estimaciones retrospectivas IGP 2024, sin aprobación ficticia."""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from test_ml_igp_historico_01 import engine, populate
from app.db.session import get_read_engine
from app.db.tables import events, ml_experiments, ml_validation_predictions
from app.ml.igp_experiments import train_igp
from app.routes.ml import router


def client_for(engine):
    app = FastAPI()
    app.include_router(router, prefix='/api/v1')
    app.dependency_overrides[get_read_engine] = lambda: engine
    return TestClient(app)


def test_retrospective_estimates_show_only_four_igp_models_and_real_events(engine):
    dataset_id, _ = populate(engine)
    train_igp(engine, dataset_id)
    with client_for(engine) as client:
        r = client.get('/api/v1/ml/estimates?page_size=5')
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['total'] == 4 * 45
        assert len(data['items']) == 5
        assert data['year'] == 2024
        assert data['split'] == 'validation'
        assert all(row['algorithm'].split('-')[0] != 'DummyClassifier' for row in data['items'])
        assert all('DummyRegressor' not in row['algorithm'] for row in data['items'])
        assert all(row['occurred_at'].startswith('2024') for row in data['items'])
        assert all(row['latitude'] is not None and row['longitude'] is not None for row in data['items'])
        assert all(row['published'] is False and row['review_status'] == 'not_reviewed'
                   for row in data['items'])
        assert all(row['probability'] is None and row['prediction_interval'] is None
                   and row['calculated_at'] is None for row in data['items'])
        assert client.get('/api/v1/ml/estimates?task_type=classification').json()['total'] == 2 * 45
        assert client.get('/api/v1/ml/estimates?task_type=regression').json()['total'] == 2 * 45
        assert client.get('/api/v1/ml/estimates?page_size=21').status_code == 422
        assert client.get(f'/api/v1/ml/estimates?dataset_id={uuid4()}').json()['total'] == 0
        assert client.post('/api/v1/ml/estimates').status_code == 405
        with engine.connect() as conn:
            assert conn.execute(select(func.count()).select_from(events)).scalar_one() == 0


def test_estimations_use_observed_errors_but_never_prediction_intervals(engine):
    dataset_id, _ = populate(engine)
    train_igp(engine, dataset_id)
    with client_for(engine) as client:
        result = client.get('/api/v1/ml/estimates?page_size=20').json()
        regression = next(x for x in result['items'] if x['task_type'] == 'regression')
        classification = next(x for x in result['items'] if x['task_type'] == 'classification')
        assert abs(regression['absolute_error'] - abs(
            regression['actual_value'] - regression['predicted_value'])) < 1e-5
        assert regression['correct_classification'] is None
        assert classification['absolute_error'] is None
        assert classification['correct_classification'] == (
            classification['actual_value'] == classification['predicted_value'])
        assert 'No predice sismos futuros' in regression['warning']


def test_2025_and_inconsistent_hash_are_filtered_server_side(engine):
    dataset_id, _ = populate(engine)
    train_igp(engine, dataset_id)
    with engine.begin() as conn:
        knn_id = conn.execute(select(ml_experiments.c.id).where(
            ml_experiments.c.algorithm == 'KNN-binary-depth')).scalar_one()
        forest_id = conn.execute(select(ml_experiments.c.id).where(
            ml_experiments.c.algorithm == 'RandomForest-magnitude')).scalar_one()
        # Invalidar el hash de un modelo, no de un baseline.
        conn.execute(ml_experiments.update().where(ml_experiments.c.id == knn_id)
                     .values(dataset_sha256='tampered'))
        # Simulamos un timestamp fuera del año de validación sin tocar el snapshot.
        row = conn.execute(select(ml_validation_predictions).where(
            ml_validation_predictions.c.experiment_id == forest_id).limit(1)).mappings().one()
        conn.execute(ml_validation_predictions.update().where(
            ml_validation_predictions.c.experiment_id == row['experiment_id'],
            ml_validation_predictions.c.source_row == row['source_row'])
            .values(occurred_at=datetime(2025, 1, 2, tzinfo=timezone.utc)))
    with client_for(engine) as client:
        data = client.get('/api/v1/ml/estimates?page_size=20').json()
        # Se excluyen todos los pares del experimento con hash alterado.
        assert data['total'] == (3 * 45 - 1)
        assert all(item['occurred_at'].startswith('2024') for item in data['items'])
