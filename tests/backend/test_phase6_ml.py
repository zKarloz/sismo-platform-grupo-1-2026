"""Pruebas fase 6 sin red: partición temporal, hash, métricas y solo-lectura."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event as sa_event, select
from sqlalchemy.pool import StaticPool

from app.db.session import get_read_engine
from app.db.tables import metadata, ml_experiments, events, sources, snapshot_rows
from app.main import app
from app.ml.laboratory import CLASSES, experiment, magnitude_class, prepare
from app.quality.service import create_dataset
from app.routes.filters import SeismicFilters


def make_records(count: int = 150):
    """Eventos sintéticos EXCLUSIVAMENTE para pruebas; no se insertan en Supabase."""
    start = datetime(2023, 1, 1, tzinfo=timezone.utc)
    rows = []
    for i in range(count):
        # Tres clases presentes en ambos períodos con patrón no trivial.
        mag = [3.2, 4.3, 5.2][i % 3]
        rows.append({
            'source_id': 'usgs-id', 'source_name': 'USGS', 'external_id': f'us{i}',
            'occurred_at': (start + timedelta(hours=i)).isoformat(),
            'latitude': -18 + i % 12, 'longitude': -78 + i % 7,
            'depth_km': None if i % 9 == 0 else 20 + (i % 15),
            'magnitude': mag,
        })
    return rows


@pytest.fixture
def engine():
    e = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @sa_event.listens_for(e, 'connect')
    def attach(dbapi, _):
        dbapi.execute("ATTACH DATABASE ':memory:' AS public")
    metadata.create_all(e)
    yield e
    e.dispose()


def populate(engine, count=150):
    source_id = uuid4()
    with engine.begin() as conn:
        conn.execute(sources.insert().values(
            id=source_id, name='USGS', organization='USGS',
            base_url='https://earthquake.usgs.gov', source_type='api', status='active'))
        for i, r in enumerate(make_records(count)):
            conn.execute(events.insert().values(
                id=uuid4(), source_id=source_id, external_id=r['external_id'],
                occurred_at=datetime.fromisoformat(r['occurred_at']),
                latitude=r['latitude'], longitude=r['longitude'],
                magnitude=r['magnitude'], depth_km=r['depth_km'],
                source_url=f'https://earthquake.usgs.gov/{i}', review_status='reviewed'))
    return create_dataset(engine, name='peru_usgs_historico',
                          filters=SeismicFilters(source='USGS', min_magnitude=2.5), max_rows=1000)


def test_target_labels_and_strict_chronology():
    assert [magnitude_class(n) for n in [2.5, 3.999, 4, 4.999, 5.0]] == [
        CLASSES[0], CLASSES[0], CLASSES[1], CLASSES[1], CLASSES[2]]
    data = prepare(list(reversed(make_records())), ratio=0.2)
    assert data['train_count'] == 120 and data['test_count'] == 30
    assert data['train_end'] < data['test_start']
    assert set(data['class_counts_train']) == set(CLASSES)
    assert len(data['X_train'][0]) == 3
    # Un cambio en magnitud alterará la ETIQUETA pero nunca X de ese evento.
    original = make_records()
    changed = [dict(r) for r in original]
    changed[10]['magnitude'] = 5.8
    import numpy as np
    np.testing.assert_array_equal(prepare(original)['X_train'], prepare(changed)['X_train'])
    assert prepare(original)['y_train'] != prepare(changed)['y_train']


def test_preconditions_fail_safely():
    with pytest.raises(ValueError, match='Muestra insuficiente'):
        prepare(make_records(35))
    with pytest.raises(ValueError, match='duplicados'):
        prepare(make_records() + [make_records()[0]])
    rows = make_records()
    for i in range(120):
        rows[i]['magnitude'] = 3.1
    with pytest.raises(ValueError, match='Clases insuficientes'):
        prepare(rows)
    with pytest.raises(ValueError, match='test_ratio'):
        prepare(make_records(), ratio=0.6)


def test_check_only_does_not_write(engine):
    ds = populate(engine)
    result = experiment(engine, ds['id'], check_only=True)
    assert result['batch_id'] is None
    assert result['inspection']['dataset_sha256'] == ds['content_sha256']
    with engine.connect() as conn:
        assert conn.execute(select(ml_experiments)).all() == []


def test_all_five_experiments_reproducible_and_comparable(engine):
    ds = populate(engine)
    result = experiment(engine, ds['id'], seed=42)
    assert len(result['experiments']) == 5
    assert {r['algorithm'] for r in result['experiments']} == {
        'DummyClassifier-most_frequent', 'LogisticRegression',
        'DummyRegressor-mean', 'LinearRegression-simple', 'LinearRegression-multiple'}
    by_alg = {r['algorithm']: r for r in result['experiments']}
    assert 0 <= by_alg['LogisticRegression']['metrics']['accuracy'] <= 1
    assert len(by_alg['LogisticRegression']['metrics']['confusion_matrix']) == 3
    assert by_alg['LinearRegression-simple']['metrics']['mae'] >= 0
    assert by_alg['DummyRegressor-mean']['metrics']['rmse'] >= 0
    with engine.connect() as conn:
        stored = conn.execute(select(ml_experiments)).mappings().all()
        assert len(stored) == 5
        assert {str(row['batch_id']) for row in stored} == {result['batch_id']}
        assert {row['dataset_sha256'] for row in stored} == {ds['content_sha256']}
        assert all(row['validation_spec']['train_end'] < row['validation_spec']['test_start'] for row in stored)
        assert all(row['validation_spec']['point_in_time_features_validated'] is False for row in stored)
    second = experiment(engine, ds['id'], seed=42)
    first_metrics = {r['algorithm']: r['metrics'] for r in result['experiments']}
    second_metrics = {r['algorithm']: r['metrics'] for r in second['experiments']}
    assert first_metrics == second_metrics


def test_snapshot_hash_tampering_stops_training(engine):
    ds = populate(engine)
    with engine.begin() as conn:
        row = conn.execute(select(snapshot_rows).order_by(snapshot_rows.c.position)).mappings().first()
        altered = dict(row['record'])
        altered['magnitude'] = 8.8
        conn.execute(snapshot_rows.update().where(
            snapshot_rows.c.dataset_id == row['dataset_id'],
            snapshot_rows.c.position == row['position']).values(record=altered))
    with pytest.raises(ValueError, match='SHA-256'):
        experiment(engine, ds['id'], check_only=True)


def test_read_only_api(engine):
    populate(engine)
    app.dependency_overrides[get_read_engine] = lambda: engine
    try:
        client = TestClient(app)
        assert client.get('/api/v1/ml/experiments').json()['total'] == 0
        assert client.post('/api/v1/ml/experiments').status_code == 405
        with engine.connect() as conn:
            ds_id = conn.execute(select(snapshot_rows.c.dataset_id).limit(1)).scalar_one()
        experiment(engine, str(ds_id))
        response = client.get('/api/v1/ml/experiments?page_size=5')
        assert response.status_code == 200
        assert response.json()['total'] == 5
        assert len(response.json()['items']) == 5
        assert 'No es predicción' in response.json()['disclaimer']
        assert client.get('/api/v1/ml/experiments?page_size=500').status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_backfill_command_rejects_invalid_ranges(monkeypatch):
    import sys
    from app.commands.backfill_usgs import main
    monkeypatch.setattr(sys, 'argv', ['backfill_usgs', '--start', '2026-10-22', '--end', '2026-10-20'])
    with pytest.raises(SystemExit) as ex:
        main()
    assert ex.value.code == 2


def test_backfill_command_chunks_and_counts(monkeypatch, capsys):
    import sys
    from types import SimpleNamespace
    from app.commands import backfill_usgs
    calls = []
    def fake_sync(start, end, mag):
        calls.append((start, end, mag))
        return SimpleNamespace(seen=3, inserted=2, updated=0, unchanged=1)
    monkeypatch.setattr(backfill_usgs, 'sync_usgs_range', fake_sync)
    monkeypatch.setattr(sys, 'argv', ['backfill_usgs', '--start', '2026-01-01',
                                      '--end', '2026-03-15', '--chunk-days', '30'])
    backfill_usgs.main()
    assert len(calls) == 3
    assert (calls[0][1] - calls[0][0]).days == 30
    assert calls[0][1] == calls[1][0]
    assert calls[-1][1].date().isoformat() == '2026-03-15'
    assert 'Nuevos 6' in capsys.readouterr().out
