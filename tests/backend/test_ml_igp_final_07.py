"""Prueba final IGP: 2025 no se lee antes de aprobación y --commit.

SQLite aislada y registros sintéticos. No consulta ni evalúa el año 2025 real.
"""
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event as sa_event, func, select
from sqlalchemy.pool import StaticPool

from app.db.tables import (dataset_reviews, datasets, historical_snapshot_rows,
                           metadata, ml_experiments, ml_final_batches,
                           ml_final_evaluations, ml_final_holdout_rows)
from app.ml.igp_experiments import VERSION
from app.ml.igp_final import _final_metrics, _make_features, evaluate_once, preflight
from app.quality.historical import DATASET_NAME, EXPECTED_XLSX_SHA256, KIND, SOURCE
from app.quality.report import content_sha256

NAMES = ['DummyRegressor-mean-magnitude', 'LinearRegression-simple',
         'DummyRegressor-mean-depth', 'LinearRegression-multiple',
         'DummyClassifier-most_frequent-depth', 'KNN-binary-depth',
         'DummyClassifier-most_frequent-magnitude', 'RandomForest-magnitude']


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
    """Replica tamaño y splits reales, exclusivamente con valores ficticios."""
    did, bid = uuid4(), uuid4()
    records = []
    for i in range(3005):
        year = 2023 if i < 2449 else 2024
        stamp = datetime(year, (i % 12)+1, (i % 25)+1, (i % 23), tzinfo=timezone.utc).isoformat()
        records.append({'source_name': SOURCE, 'source_row': i+2,
                        'occurred_at': stamp, 'latitude': -16.0 + (i % 13) * .1,
                        'longitude': -75.0 - (i % 9) * .1,
                        'depth_km': [30., 90., 350.][i % 3],
                        'magnitude': [4.1, 4.6, 5.1][i % 3],
                        'split': 'train' if year == 2023 else 'validation'})
    records.sort(key=lambda r: (r['occurred_at'], r['source_row']))
    spec = {'source': SOURCE, 'dataset_kind': KIND, 'min_magnitude': 4.0,
            'source_file_sha256': EXPECTED_XLSX_SHA256}
    with engine.begin() as c:
        c.execute(datasets.insert().values(id=did, name=DATASET_NAME, version=1,
            query_spec=spec, row_count=3005, quality_report={'status': 'ok'},
            content_sha256=content_sha256(records)))
        c.execute(historical_snapshot_rows.insert(), [
            {'dataset_id':did, 'position':i, 'source_row':r['source_row'],
             'split':r['split'], 'record':r} for i,r in enumerate(records,1)])
        c.execute(ml_experiments.insert(), [dict(
            id=uuid4(), dataset_id=did, batch_id=bid, task_type='classification' if 'Classifier' in name or 'Forest' in name or 'KNN' in name else 'regression',
            algorithm=name, target_name='magnitude_observed', model_version=VERSION,
            features=[], params={'baseline':name.startswith('Dummy')}, metrics={},
            validation_spec={'test_2025_reserved':True},
            dataset_sha256=content_sha256(records), seed=42,
            limitations='retrospectivo', status='completed') for name in NAMES])
    return str(did), str(bid), records


def test_preflight_does_not_open_2025_and_requires_approval(engine, monkeypatch):
    did, bid, _ = populate(engine)
    # La inspección no accede al archivo de prueba ni calcula métricas.
    monkeypatch.setattr('app.ml.igp_final._prepare_holdout', lambda *a,**k: pytest.fail('Abrió 2025 en check-only'))
    status = preflight(engine, bid)
    assert status['approval_required'] and not status['year_2025_opened']
    with pytest.raises(ValueError, match='Aprueba primero'):
        evaluate_once(engine, bid)
    with engine.connect() as c:
        assert c.execute(select(func.count()).select_from(ml_final_batches)).scalar_one() == 0


def test_approved_holdout_is_frozen_once(engine, monkeypatch):
    did, bid, dev = populate(engine)
    with engine.begin() as c:
        c.execute(dataset_reviews.insert().values(dataset_id=__import__('uuid').UUID(did),
            decision='approved', note='Revisión retrospectiva completa',
            reviewed_by=uuid4(), reviewed_at=datetime.now(timezone.utc),
            dataset_sha256=content_sha256(dev)))
    # Simular reconstrucción de la corrida anterior, sin usar datos reales 2025.
    monkeypatch.setattr('app.commands.backfill_igp_predictions.replay_batch',
                        lambda *a,**k: {'metrics_match':True})
    holdout=[]
    for i in range(20):
        holdout.append({'source_row': 4000+i, 'source_name':SOURCE,
            'occurred_at':datetime(2025,1,(i%20)+1,tzinfo=timezone.utc).isoformat(),
            'latitude':-15.2, 'longitude':-75.2, 'depth_km':30.0 + i,
            'magnitude':4.1 + (i%4)*0.25, 'split':'test'})
    count={'reads':0}
    def fake_holdout(*a):
        count['reads']+=1
        return holdout
    monkeypatch.setattr('app.ml.igp_final._prepare_holdout', fake_holdout)
    monkeypatch.setattr('app.ml.igp_final._final_metrics',
        lambda tr,te,seed:{name:{'mae':0.2} for name in NAMES})
    check=preflight(engine,bid)
    assert check['approved'] and check['can_commit'] and not check['year_2025_opened']
    result=evaluate_once(engine,bid)
    assert result['test_count']==20 and result['development_count']==3005
    assert result['writes'] and count['reads']==1
    with engine.connect() as c:
        assert c.execute(select(func.count()).select_from(ml_final_holdout_rows)).scalar_one()==20
        assert c.execute(select(func.count()).select_from(ml_final_evaluations)).scalar_one()==8
    second=evaluate_once(engine,bid)
    assert second['already_evaluated'] and not second['writes'] and count['reads']==1


def test_features_use_prior_events_only_and_no_cross_split():
    dev=[{'source_row':2,'source_name':SOURCE,'occurred_at':'2024-12-31T23:59:00+00:00',
          'latitude':-14,'longitude':-75,'depth_km':30,'magnitude':4.1,'split':'validation'}]
    test=[{'source_row':3,'source_name':SOURCE,'occurred_at':'2025-01-01T00:00:00+00:00',
           'latitude':-14,'longitude':-75,'depth_km':90,'magnitude':4.5,'split':'test'},
          {'source_row':4,'source_name':SOURCE,'occurred_at':'2025-01-01T00:00:00+00:00',
           'latitude':-14,'longitude':-75,'depth_km':30,'magnitude':5.1,'split':'test'}]
    development, final=_make_features(dev,test)
    assert development[0]['previous_7d']==0
    assert final[0]['previous_7d']==1 and final[1]['previous_7d']==1
    with pytest.raises(ValueError, match='años ajenos'):
        _make_features(dev,[dict(test[0],occurred_at='2026-01-01T00:00:00+00:00')])


def test_estimators_have_eight_outputs_without_reading_real_holdout():
    # Verifica las cuatro familias de estimadores sobre datos sintéticos.
    tr=[{'depth':float([20,90,330][i%3]),'magnitude':float([4.1,4.6,5.2][i%3]),
         'latitude':-16.0 + (i%8)*.1,'longitude':-75.0+(i%6)*.1,
         'hour_utc':float(i%24),'previous_7d':i%8} for i in range(150)]
    te=tr[:30]
    results=_final_metrics(tr,te,42)
    assert set(results)==set(NAMES)
    assert len(results['KNN-binary-depth']['confusion_matrix'])==2
    assert len(results['RandomForest-magnitude']['confusion_matrix'])==3


def test_final_report_api_read_only_and_hash_checked(engine, monkeypatch):
    """Las métricas finales se muestran solo tras existir una evaluación inmutable."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.db.session import get_read_engine
    from app.routes.ml import router

    did, bid, dev = populate(engine)
    app = FastAPI()
    app.include_router(router, prefix='/api/v1')
    app.dependency_overrides[get_read_engine] = lambda: engine
    with TestClient(app) as client:
        before = client.get(f'/api/v1/ml/final-evaluations?batch_id={bid}')
        assert before.status_code == 200 and before.json()['total'] == 0
    with engine.begin() as c:
        c.execute(dataset_reviews.insert().values(dataset_id=__import__('uuid').UUID(did),
            decision='approved', note='Revisión retrospectiva completa',
            reviewed_by=uuid4(), reviewed_at=datetime.now(timezone.utc),
            dataset_sha256=content_sha256(dev)))
    monkeypatch.setattr('app.commands.backfill_igp_predictions.replay_batch',
                        lambda *a,**k:{'metrics_match':True})
    rows=[{'source_row': 4002, 'source_name':SOURCE,
           'occurred_at':'2025-04-10T00:00:00+00:00',
           'latitude':-15.3, 'longitude':-76.1, 'depth_km':35.,
           'magnitude':4.3, 'split':'test'}]
    monkeypatch.setattr('app.ml.igp_final._prepare_holdout', lambda *a:rows)
    monkeypatch.setattr('app.ml.igp_final._final_metrics',
                        lambda *a:{name:{'mae':0.3} for name in NAMES})
    evaluate_once(engine, bid)
    with TestClient(app) as client:
        response=client.get(f'/api/v1/ml/final-evaluations?batch_id={bid}')
        assert response.status_code == 200 and response.json()['total'] == 1
        assert response.json()['items'][0]['test_count'] == 1
        assert len(response.json()['items'][0]['models']) == 8
        assert client.post('/api/v1/ml/final-evaluations').status_code == 405
    with engine.begin() as c:
        c.execute(ml_final_holdout_rows.update().values(record={**rows[0],'magnitude':7.0}))
    with TestClient(app) as client:
        assert client.get(f'/api/v1/ml/final-evaluations?batch_id={bid}').status_code == 409
