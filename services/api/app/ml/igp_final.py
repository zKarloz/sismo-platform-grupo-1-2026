"""Prueba final única 2025 del laboratorio retrospectivo IGP.

El conjunto 2025 se abre EXCLUSIVAMENTE con commit=True, después de la
aprobación humana y del bloqueo de la corrida de validación 2024.
No se modifican ml_experiments, seismic_events ni las predicciones 2024.
"""
from collections import Counter, deque
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError

from app.db.tables import (dataset_reviews, datasets, ml_experiments, ml_final_batches,
                           ml_final_evaluations, ml_final_holdout_rows)
from app.igp.history_catalog import DEFAULT_XLSX_PATH, _read_official_xlsx
from app.ml.igp_experiments import (DEPTH_CLASSES, MAG_CLASSES, VERSION, _utc,
                                     load_igp_snapshot, magnitude_class, prepare_igp)
from app.quality.historical import EXPECTED_XLSX_SHA256, KIND, SOURCE
from app.quality.report import content_sha256

# El nombre fija un protocolo de evaluación, no una promesa de pronóstico.
FINAL_METHOD = 'refit_2019_2024_fixed_config_then_one_holdout_2025'


def preflight(engine: Engine, batch_id: str) -> dict:
    """Comprueba la aprobación y la corrida SIN importar el Excel ni leer 2025."""
    bid = UUID(batch_id)
    with engine.connect() as conn:
        saved = conn.execute(select(ml_experiments).where(
            ml_experiments.c.batch_id == bid)).mappings().all()
        if len(saved) != 8 or len({r['algorithm'] for r in saved}) != 8:
            raise ValueError('La corrida debe contener ocho experimentos distintos')
        if len({r['dataset_id'] for r in saved}) != 1 or len({r['seed'] for r in saved}) != 1:
            raise ValueError('Corrida con dataset o semilla inconsistentes')
        ds = conn.execute(select(datasets).where(
            datasets.c.id == saved[0]['dataset_id'])).mappings().one()
        review = conn.execute(select(dataset_reviews).where(
            dataset_reviews.c.dataset_id == ds['id'])).mappings().first()
        registered = conn.execute(select(ml_final_batches).where(
            ml_final_batches.c.dataset_id == ds['id'])).mappings().first()
    spec = ds['query_spec']
    if (spec.get('source') != SOURCE or spec.get('dataset_kind') != KIND or
            ds['content_sha256'] != saved[0]['dataset_sha256'] or
            spec.get('source_file_sha256') != EXPECTED_XLSX_SHA256 or
            spec.get('min_magnitude') != 4.0):
        raise ValueError('El dataset no corresponde a la versión IGP instrumental validada')
    expected_algorithms = {'DummyRegressor-mean-magnitude', 'LinearRegression-simple',
                           'DummyRegressor-mean-depth', 'LinearRegression-multiple',
                           'DummyClassifier-most_frequent-depth', 'KNN-binary-depth',
                           'DummyClassifier-most_frequent-magnitude', 'RandomForest-magnitude'}
    if {r['algorithm'] for r in saved} != expected_algorithms:
        raise ValueError('No es la selección de ocho algoritmos aprobada')
    if any(r['model_version'] != VERSION or r['status'] != 'completed' or
           r['validation_spec'].get('test_2025_reserved') is not True or
           r['dataset_sha256'] != ds['content_sha256'] or
           r['seed'] != saved[0]['seed'] for r in saved):
        raise ValueError('La configuración de la corrida no está congelada')
    if registered and registered['batch_id'] != bid:
        raise ValueError('Este dataset ya tuvo su evaluación final con otra corrida')
    # Control estructural y SHA del desarrollo, sin tocar el holdout 2025.
    verified, frozen = load_igp_snapshot(engine, str(ds['id']))
    partition = prepare_igp(frozen)
    if (verified['content_sha256'] != ds['content_sha256'] or
            partition['counts'] != {'train': 2449, 'validation': 556}):
        raise ValueError('Integridad o particiones del dataset de desarrollo alteradas')
    approved = bool(review and review['decision'] == 'approved' and
                    review['dataset_sha256'] == ds['content_sha256'])
    return {'batch_id': batch_id, 'dataset_id': str(ds['id']),
            'dataset_sha256': ds['content_sha256'], 'experiments': 8,
            'train_rows_expected': ds['row_count'], 'approved': approved,
            'approval_required': not approved,
            'already_evaluated': bool(registered),
            'can_commit': approved and not registered,
            'year_2025_opened': False, 'writes': False,
            'note': 'Comprobación previa: no se consultó ni evaluó el año 2025.'}


def _prepare_holdout(path: Path, source_sha: str) -> list[dict]:
    """Congela eventos M>=4 de 2025, usando la misma edición exacta del Excel."""
    path = Path(path)
    if not path.is_file() or sha256(path.read_bytes()).hexdigest() != source_sha:
        raise ValueError('El Excel no coincide con la edición IGP autorizada')
    catalog = _read_official_xlsx(path)
    if catalog.source_mode != 'censis_xlsx_snapshot' or catalog.skipped or catalog.xlsx_sha256 != source_sha:
        raise ValueError('Catálogo instrumental incompleto o ilegible')
    rows = []
    for event in catalog.events:
        if int(event['fecha_utc'][:4]) != 2025 or event['magnitud'] < 4.0:
            continue
        identifier = event['id']
        if not identifier.startswith('IGP-CENSIS-XLSX-R'):
            raise ValueError('Identificador histórico inesperado')
        row = int(identifier.removeprefix('IGP-CENSIS-XLSX-R'))
        rows.append({'source_row': row, 'source_name': SOURCE,
                     'occurred_at': event['fecha_utc'], 'latitude': float(event['latitud']),
                     'longitude': float(event['longitud']), 'depth_km': float(event['profundidad_km']),
                     'magnitude': float(event['magnitud']), 'split': 'test'})
    rows.sort(key=lambda r: (r['occurred_at'], r['source_row']))
    if not rows or len(rows) > 5000 or len({r['source_row'] for r in rows}) != len(rows):
        raise ValueError('Prueba final vacía, duplicada o excesiva')
    return rows


def _make_features(dev: list[dict], holdout: list[dict]) -> tuple[list[dict], list[dict]]:
    """Recalcula el conteo causal de 7 días sin utilizar objetivos futuros.

    Para 2025 solo cuenta eventos ANTERIORES de la misma edición IGP M>=4;
    nunca introduce un evento posterior o contemporáneo en las variables.
    """
    if not all(int(r['occurred_at'][:4]) == 2025 and r['split'] == 'test' for r in holdout):
        raise ValueError('Holdout contiene años ajenos a 2025')
    if len({r['source_row'] for r in dev + holdout}) != len(dev) + len(holdout):
        raise ValueError('Filas compartidas entre desarrollo y prueba final')
    items = sorted(dev + holdout, key=lambda r: (r['occurred_at'], r['source_row']))
    window: deque[datetime] = deque()
    result = {'development': [], 'test': []}
    for r in items:
        when = _utc(r['occurred_at'])
        while window and window[0] < when - timedelta(days=7):
            window.popleft()
        previous = len(window) - sum(x == when for x in window)
        parsed = {'date': when.isoformat(), 'source_row': r['source_row'],
                  'latitude': float(r['latitude']), 'longitude': float(r['longitude']),
                  'depth': float(r['depth_km']), 'magnitude': float(r['magnitude']),
                  'hour_utc': when.hour + when.minute / 60 + when.second / 3600,
                  'previous_7d': previous}
        result['test' if r['split'] == 'test' else 'development'].append(parsed)
        window.append(when)
    tr, te = result['development'], result['test']
    if not tr or not te or tr[-1]['date'] >= te[0]['date']:
        raise ValueError('La prueba final se solapa con el desarrollo')
    return tr, te


def _final_metrics(train: list[dict], test: list[dict], seed: int) -> dict[str, dict]:
    """Ajusta ocho modelos con parámetros FIJOS y evalúa 2025 UNA sola vez."""
    import numpy as np
    from sklearn.dummy import DummyRegressor, DummyClassifier
    from sklearn.linear_model import LinearRegression
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                                 f1_score, mean_absolute_error, mean_squared_error, r2_score)

    results = {}
    def matrix(items, features):
        return np.array([[r[name] for name in features] for r in items], dtype=float)
    def regression(names, target, baseline_name, model_name):
        xtr, xte = matrix(train, names), matrix(test, names)
        ytr = np.array([r[target] for r in train], dtype=float)
        yte = np.array([r[target] for r in test], dtype=float)
        for name, model in ((baseline_name, DummyRegressor(strategy='mean')),
                            (model_name, LinearRegression())):
            predicted = model.fit(xtr, ytr).predict(xte)
            results[name] = {'mae': round(float(mean_absolute_error(yte, predicted)), 6),
                             'rmse': round(float(np.sqrt(mean_squared_error(yte, predicted))), 6),
                             'r2': round(float(r2_score(yte, predicted)), 6)}
    regression(('depth',), 'magnitude', 'DummyRegressor-mean-magnitude', 'LinearRegression-simple')
    regression(('latitude', 'longitude'), 'depth', 'DummyRegressor-mean-depth', 'LinearRegression-multiple')
    def classification(names, actual_label, labels, base_name, model_name, model):
        xtr, xte = matrix(train, names), matrix(test, names)
        ytr = [actual_label(r) for r in train]
        yte = [actual_label(r) for r in test]
        for name, estimator in ((base_name, DummyClassifier(strategy='most_frequent')),
                                (model_name, model)):
            estimated = estimator.fit(xtr, ytr).predict(xte)
            results[name] = {'accuracy': round(float(accuracy_score(yte, estimated)), 6),
                'macro_f1': round(float(f1_score(yte, estimated, labels=labels, average='macro', zero_division=0)), 6),
                'confusion_matrix': confusion_matrix(yte, estimated, labels=labels).tolist(),
                'labels': list(labels),
                'per_class': classification_report(yte, estimated, labels=labels,
                                                   output_dict=True, zero_division=0)}
    classification(('latitude','longitude'),
                   lambda r: DEPTH_CLASSES[0] if r['depth'] <= 60 else DEPTH_CLASSES[1],
                   DEPTH_CLASSES, 'DummyClassifier-most_frequent-depth', 'KNN-binary-depth',
                   Pipeline([('scaler', StandardScaler()), ('knn', KNeighborsClassifier(n_neighbors=5, weights='distance'))]))
    features = ('latitude','longitude','depth','hour_utc','previous_7d')
    classification(features, lambda r: magnitude_class(r['magnitude']), MAG_CLASSES,
                   'DummyClassifier-most_frequent-magnitude', 'RandomForest-magnitude',
                   RandomForestClassifier(n_estimators=200, max_depth=12, min_samples_leaf=5,
                                          class_weight='balanced', random_state=seed, n_jobs=1))
    return results


def evaluate_once(engine: Engine, batch_id: str, *, xlsx_path: Path = DEFAULT_XLSX_PATH) -> dict:
    """Acción explícita: reproduce 2024, refit en 2019–2024 y prueba 2025."""
    check = preflight(engine, batch_id)
    if not check['approved']:
        raise ValueError('Aprueba primero el dataset en Calidad y datasets → Trazabilidad')
    if check['already_evaluated']:
        return dict(check, already_evaluated=True, writes=False,
                    note='Prueba final ya registrada. No se ha repetido.')
    # Bloqueo reproducible: métricas y parámetros guardados deben coincidir EXACTAMENTE.
    from app.commands.backfill_igp_predictions import replay_batch
    replay_batch(engine, batch_id, commit=False)
    ds, rows = load_igp_snapshot(engine, check['dataset_id'])
    original = prepare_igp(rows)
    if len(rows) != 3005 or original['counts'] != {'train':2449,'validation':556}:
        raise ValueError('No coincide el protocolo IGP 2019–2024 aprobado')
    holdout = _prepare_holdout(xlsx_path, EXPECTED_XLSX_SHA256)
    tr, te = _make_features(rows, holdout)
    if len(tr) != 3005 or len(te) != len(holdout):
        raise ValueError('Conjunto de prueba final inconsistente')
    with engine.connect() as conn:
        experiments = conn.execute(select(ml_experiments).where(
            ml_experiments.c.batch_id == UUID(batch_id))).mappings().all()
    outputs = _final_metrics(tr, te, experiments[0]['seed'])
    if set(outputs) != {r['algorithm'] for r in experiments}:
        raise ValueError('Los resultados no corresponden a los ocho modelos registrados')
    digest = content_sha256(holdout)
    # Todo se guarda de manera atómica. La UNIQUE(dataset_id) impide múltiples
    # evaluaciones de prueba con nuevos lotes del mismo dataset.
    try:
        with engine.begin() as conn:
            conn.execute(ml_final_batches.insert().values(
                batch_id=UUID(batch_id), dataset_id=UUID(check['dataset_id']),
                dataset_sha256=check['dataset_sha256'], source_file_sha256=EXPECTED_XLSX_SHA256,
                holdout_sha256=digest, test_count=len(holdout), development_count=len(tr),
                method=FINAL_METHOD,
                limitations='Retrospectivo. No predice ocurrencia sísmica ni constituye alerta oficial.',
                evaluated_at=datetime.now(timezone.utc)))
            conn.execute(ml_final_holdout_rows.insert(), [
                {'batch_id': UUID(batch_id), 'source_row': row['source_row'],
                 'position': i, 'record': row} for i, row in enumerate(holdout, 1)
            ])
            conn.execute(ml_final_evaluations.insert(), [
                {'experiment_id': r['id'], 'batch_id': UUID(batch_id),
                 'algorithm': r['algorithm'], 'metrics': outputs[r['algorithm']]}
                for r in experiments
            ])
    except IntegrityError as exc:
        raise ValueError('La prueba final ya existe o hubo una ejecución concurrente; no se duplicó') from exc
    return {'batch_id': batch_id, 'dataset_id': check['dataset_id'],
            'test_count': len(holdout), 'development_count': len(tr),
            'source_file_sha256': EXPECTED_XLSX_SHA256, 'holdout_sha256': digest,
            'experiments': 8, 'writes': True, 'year_2025_opened': True,
            'note': 'Evaluación final única de eventos históricos; no es un pronóstico sísmico.'}
