"""Regresión de laboratorio IGP; SQLite sintético, cero conexiones a Supabase."""
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event as sa_event, func, select
from sqlalchemy.pool import StaticPool

from app.db.session import get_read_engine
from app.db.tables import datasets, historical_snapshot_rows, metadata, ml_experiments, events
from app.ml.igp_experiments import load_igp_snapshot, prepare_igp, inspection, train_igp, KNN_NOTE
from app.quality.historical import DATASET_NAME, KIND, SOURCE
from app.quality.report import content_sha256
from app.routes.ml import router


@pytest.fixture
def engine():
    db = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @sa_event.listens_for(db, 'connect')
    def attach(connection, _):
        connection.execute("ATTACH DATABASE ':memory:' AS public")
    metadata.create_all(db)
    yield db
    db.dispose()


def populate(engine):
    """120 eventos de train y 45 de validation, todos ficticios y M >= 4."""
    rows = []
    for i in range(165):
        year = 2023 if i < 120 else 2024
        stamp = datetime(year, 1, (i % 25) + 1, (i // 25) % 24, tzinfo=timezone.utc)
        record = {
            'source_name': SOURCE, 'source_row': i + 2, 'external_id': f'IGP-CENSIS-XLSX-R{i+2}',
            'source_url': 'https://ultimosismo.igp.gob.pe/repositorio/datos-sismicos',
            'occurred_at': stamp.isoformat(), 'latitude': -15 + (i % 13) * 0.3,
            'longitude': -78 + (i % 7) * 0.4, 'depth_km': float([30, 90, 330][i % 3]),
            'magnitude': float([4.1, 4.6, 5.1][i % 3]),
            'magnitude_type': None, 'place': None, 'source_updated_at': None,
            'split': 'train' if year == 2023 else 'validation',
        }
        rows.append(record)
    # Orden definido por el capturador histórico original.
    rows.sort(key=lambda r: (r['occurred_at'], r['source_row']))
    did = uuid4()
    with engine.begin() as conn:
        conn.execute(datasets.insert().values(id=did, name=DATASET_NAME, version=1,
            query_spec={'source': SOURCE, 'dataset_kind': KIND, 'min_magnitude': 4.0},
            row_count=len(rows), quality_report={'status': 'missing_values'},
            content_sha256=content_sha256(rows)))
        conn.execute(historical_snapshot_rows.insert(), [
            {'dataset_id': did, 'position': index, 'source_row': record['source_row'],
             'split': record['split'], 'record': record}
            for index, record in enumerate(rows, start=1)
        ])
    return str(did), rows


def test_snapshot_verifies_origin_splits_and_hash(engine):
    did, records = populate(engine)
    ds, loaded = load_igp_snapshot(engine, did)
    assert ds['row_count'] == 165 and loaded == records
    data = prepare_igp(records)
    assert data['counts'] == {'train': 120, 'validation': 45}
    check = inspection(engine, did)
    assert check['test_2025_reserved'] and check['counts']['validation'] == 45
    assert 'dos clases' in check['knn_note']
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(events)).scalar_one() == 0


def test_tampering_blocks_training_before_writing(engine):
    did, _ = populate(engine)
    with engine.begin() as conn:
        row = conn.execute(select(historical_snapshot_rows).limit(1)).mappings().one()
        bad = dict(row['record'], magnitude=9.0)
        conn.execute(historical_snapshot_rows.update().where(
            historical_snapshot_rows.c.dataset_id == row['dataset_id'],
            historical_snapshot_rows.c.position == row['position']).values(record=bad))
    with pytest.raises(ValueError, match='SHA-256'):
        inspection(engine, did)
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(ml_experiments)).scalar_one() == 0


def test_rejects_invalid_2025_even_when_hash_matches(engine):
    did, rows = populate(engine)
    rows[-1]['occurred_at'] = datetime(2025, 1, 10, tzinfo=timezone.utc).isoformat()
    with engine.begin() as conn:
        conn.execute(datasets.update().where(datasets.c.id == __import__('uuid').UUID(did))
                     .values(content_sha256=content_sha256(rows)))
        for i, row in enumerate(rows, start=1):
            conn.execute(historical_snapshot_rows.update().where(
                historical_snapshot_rows.c.dataset_id == __import__('uuid').UUID(did),
                historical_snapshot_rows.c.position == i).values(record=row))
    with pytest.raises(ValueError, match='2025'):
        inspection(engine, did)


def test_models_dummy_comparisons_and_read_only_api(engine):
    did, _ = populate(engine)
    result = train_igp(engine, did, seed=42)
    assert len(result['experiments']) == 8
    target_groups = {row['target_name'] for row in result['experiments']}
    assert target_groups == {'magnitude_observed', 'depth_observed',
                             'depth_class_observed', 'magnitude_range_observed'}
    for target in target_groups:
        rows = [r for r in result['experiments'] if r['target_name'] == target]
        assert len(rows) == 2 and sum(bool(r['params']['baseline']) for r in rows) == 1
        assert all(r['validation_spec']['test_2025_reserved'] for r in rows)
    knn = next(r for r in result['experiments'] if r['algorithm'] == 'KNN-binary-depth')
    assert knn['params']['scaling'] == 'StandardScaler_fit_train_only'
    assert len(knn['metrics']['confusion_matrix']) == 2 and KNN_NOTE in knn['limitations']
    forest = next(r for r in result['experiments'] if r['algorithm'] == 'RandomForest-magnitude')
    assert forest['params']['class_weight'] == 'balanced'
    assert len(forest['metrics']['confusion_matrix']) == 3
    assert len(next(r for r in result['experiments'] if r['algorithm'] == 'LinearRegression-simple')['metrics']['real_vs_estimated']) > 0
    app = FastAPI()
    app.include_router(router, prefix='/api/v1')
    app.dependency_overrides[get_read_engine] = lambda: engine
    with TestClient(app) as client:
        response = client.get('/api/v1/ml/experiments?page_size=5')
        assert response.status_code == 200 and response.json()['total'] == 8
        assert len(response.json()['items']) == 5
        assert client.post('/api/v1/ml/experiments').status_code == 405
        assert client.get('/api/v1/ml/experiments?task_type=classification').json()['total'] == 4
        assert client.get('/api/v1/ml/experiments?page_size=101').status_code == 422
    with engine.connect() as conn:
        assert conn.execute(select(func.count()).select_from(ml_experiments)).scalar_one() == 8
        assert conn.execute(select(func.count()).select_from(events)).scalar_one() == 0


def test_old_usgs_not_exposed_in_igp_api(engine):
    did, _ = populate(engine)
    with engine.begin() as conn:
        conn.execute(datasets.insert().values(id=uuid4(), name='peru_usgs_historico', version=1,
            query_spec={'source': 'USGS', 'dataset_kind': 'operativo'}, row_count=0,
            quality_report={'status': 'ok'}, content_sha256='a' * 64))
    app = FastAPI()
    app.include_router(router, prefix='/api/v1')
    app.dependency_overrides[get_read_engine] = lambda: engine
    with TestClient(app) as client:
        assert client.get('/api/v1/ml/experiments').json()['total'] == 0
        assert client.get(f'/api/v1/ml/experiments?dataset_id={did}').json()['total'] == 0
