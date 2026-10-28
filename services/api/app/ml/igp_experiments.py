"""Cuatro experimentos supervisados RETROSPECTIVOS del snapshot instrumental IGP.

No lee 2025, no consulta seismic_events y no ofrece pronóstico sísmico.
Todas las transformaciones se ajustan SOLO a train 2019–2023.
"""
from collections import Counter, deque
from datetime import datetime, timedelta, timezone
from math import isfinite
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.engine import Engine

from app.db.tables import datasets, historical_snapshot_rows, ml_experiments
from app.quality.historical import DATASET_NAME, KIND, SOURCE
from app.quality.report import content_sha256

VERSION = 'igp-retrospectivo-v1'
MAG_CLASSES = ('M 4.0–4.49', 'M 4.5–4.99', 'M ≥ 5.0')
DEPTH_CLASSES = ('Superficial (≤60 km)', 'No superficial (>60 km)')
KNN_NOTE = (
    'Se utilizaron dos clases por la escasez de sismos profundos (>300 km) '
    'en la muestra IGP 2019–2024. La clase no superficial reúne sismos '
    'intermedios y profundos, sin eliminar ni sintetizar registros.'
)
LIMITATIONS = (
    'Estimación experimental RETROSPECTIVA de atributos de sismos ya registrados. '
    'No predice ocurrencia, magnitud ni riesgo de futuros terremotos; no genera alertas. '
    'Selección M ≥ 4.0, cambios de cobertura/catálogo, magnitudes sin escala identificada, '
    'localización espacial y réplicas pueden limitar la extrapolación. '
    'Validación de 2024, prueba de 2025 reservada; revisión sismológica pendiente.'
)


def _utc(value: object) -> datetime:
    if not isinstance(value, str):
        raise ValueError('Registro con fecha UTC inválida')
    value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if value.tzinfo is None:
        raise ValueError('Registro sin zona horaria')
    return value.astimezone(timezone.utc)


def load_igp_snapshot(engine: Engine, dataset_id: str) -> tuple[dict, list[dict]]:
    """Verifica procedencia, integridad y particiones sin leer eventos operativos."""
    uid = UUID(dataset_id)
    with engine.connect() as conn:
        ds = conn.execute(select(datasets).where(datasets.c.id == uid)).mappings().first()
        if ds is None:
            raise ValueError('Dataset inexistente')
        spec = ds['query_spec']
        if (ds['name'] != DATASET_NAME or spec.get('source') != SOURCE or
                spec.get('dataset_kind') != KIND or spec.get('min_magnitude') != 4.0):
            raise ValueError('Solo se admite el snapshot histórico IGP aprobado')
        frozen = conn.execute(select(historical_snapshot_rows).where(
            historical_snapshot_rows.c.dataset_id == uid
        ).order_by(historical_snapshot_rows.c.position)).mappings().all()
    rows = [row['record'] for row in frozen]
    if len(rows) != ds['row_count'] or content_sha256(rows) != ds['content_sha256']:
        raise ValueError('SHA-256 o conteo del snapshot no coincide')
    if ds['quality_report'].get('status') not in ('ok', 'missing_values'):
        raise ValueError('El informe de calidad requiere revisión')
    if len(rows) < 60:
        raise ValueError('Muestra insuficiente para entrenar')
    for i, (frozen_row, record) in enumerate(zip(frozen, rows), start=1):
        date = _utc(record.get('occurred_at'))
        split = 'train' if 2019 <= date.year <= 2023 else 'validation' if date.year == 2024 else None
        if (frozen_row['position'] != i or frozen_row['split'] != split or
                record.get('split') != split or record.get('source_name') != SOURCE or
                record.get('source_row') != frozen_row['source_row'] or
                not split):
            raise ValueError('Partición histórica inconsistente o contiene 2025')
    return dict(ds), rows


def magnitude_class(value: float) -> str:
    """Tres rangos DIDÁCTICOS, no clases oficiales de peligro sísmico."""
    return MAG_CLASSES[0] if value < 4.5 else MAG_CLASSES[1] if value < 5.0 else MAG_CLASSES[2]


def prepare_igp(rows: list[dict]) -> dict:
    """Divide por el split congelado y calcula conteos causales de últimos 7 días.

    El conteo corresponde exclusivamente a eventos M >=4 incluidos en ESTA
    versión del catálogo, no al número verdadero de todos los sismos ocurridos.
    """
    ordered = sorted(rows, key=lambda r: (r['occurred_at'], r['source_row']))
    window: deque[datetime] = deque()
    previous: datetime | None = None
    unique_rows: set[int] = set()
    by_split = {'train': [], 'validation': []}
    for record in ordered:
        when = _utc(record['occurred_at'])
        if previous is not None and when < previous:
            raise ValueError('Orden temporal inválido')
        previous = when
        if record['source_row'] in unique_rows:
            raise ValueError('Fila de origen duplicada')
        unique_rows.add(record['source_row'])
        values = (record.get('latitude'), record.get('longitude'),
                  record.get('depth_km'), record.get('magnitude'))
        if (any(type(v) not in (int, float) or not isfinite(v) for v in values)
                or not -90 <= values[0] <= 90 or not -180 <= values[1] <= 180
                or not 0 <= values[2] <= 1000 or not 4.0 <= values[3] <= 12):
            raise ValueError('Valores físicos ausentes o incoherentes')
        while window and window[0] < when - timedelta(days=7):
            window.popleft()
        # Excluye el evento actual: información disponible antes de su hora UTC.
        # Empates de timestamp: no considerar contemporáneos como 'anteriores'.
        previous_7d = len(window) - sum(value == when for value in window)
        hour_utc = when.hour + when.minute / 60 + when.second / 3600
        item = {
            'date': when.isoformat(), 'latitude': float(values[0]),
            'longitude': float(values[1]), 'depth': float(values[2]),
            'magnitude': float(values[3]), 'hour_utc': hour_utc,
            'previous_7d': previous_7d,
        }
        if record['split'] not in by_split:
            raise ValueError('Partición desconocida')
        by_split[record['split']].append(item)
        window.append(when)
    train, valid = by_split['train'], by_split['validation']
    if len(train) < 60 or len(valid) < 30 or train[-1]['date'] >= valid[0]['date']:
        raise ValueError('Split cronológico insuficiente o solapado')
    # Comprobar que los datos abarcan solo los años aprobados para cada partición.
    if (any(not 2019 <= int(r['date'][:4]) <= 2023 for r in train) or
            any(int(r['date'][:4]) != 2024 for r in valid)):
        raise ValueError('Partición temporal incompatible con 2019–2024')
    return {'train': train, 'validation': valid, 'counts': {'train': len(train), 'validation': len(valid)}}


def inspection(engine: Engine, dataset_id: str) -> dict:
    """Comprobación sin importar sklearn, entrenar ni escribir en la DB."""
    ds, rows = load_igp_snapshot(engine, dataset_id)
    data = prepare_igp(rows)
    def counts(values):
        return {'magnitudes': dict(Counter(magnitude_class(r['magnitude']) for r in values)),
                'profundidades': dict(Counter(DEPTH_CLASSES[0] if r['depth'] <= 60 else DEPTH_CLASSES[1]
                                           for r in values)),
                'profundos_mayor_300_km': sum(r['depth'] > 300 for r in values)}
    return {
        'dataset_id': dataset_id, 'dataset_name': ds['name'], 'dataset_version': ds['version'],
        'dataset_sha256': ds['content_sha256'], 'counts': data['counts'],
        'train_start': data['train'][0]['date'], 'train_end': data['train'][-1]['date'],
        'validation_start': data['validation'][0]['date'], 'validation_end': data['validation'][-1]['date'],
        'classes_train': counts(data['train']), 'classes_validation': counts(data['validation']),
        'test_2025_reserved': True, 'knn_note': KNN_NOTE,
    }


def train_igp(engine: Engine, dataset_id: str, *, seed: int = 42) -> dict:
    """Entrena cuatro modelos + un Dummy para CADA objetivo, misma validación 2024."""
    if not 0 <= seed <= 2**31 - 1:
        raise ValueError('Semilla fuera de rango')
    ds, rows = load_igp_snapshot(engine, dataset_id)
    data = prepare_igp(rows)
    check = inspection(engine, dataset_id)
    import numpy as np  # Dependencias instaladas solo en la CLI local.
    import sklearn
    from sklearn.dummy import DummyClassifier, DummyRegressor
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                                 f1_score, mean_absolute_error, mean_squared_error, r2_score)
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    tr, va = data['train'], data['validation']
    def feature_matrix(items, names):
        return np.array([[r[name] for name in names] for r in items], dtype=float)
    def mag_label(items): return [magnitude_class(r['magnitude']) for r in items]
    def dep_label(items): return [DEPTH_CLASSES[0] if r['depth'] <= 60 else DEPTH_CLASSES[1] for r in items]
    validation = {
        'method': 'holdout_2019_2023_train_2024_validation',
        'train_count': len(tr), 'validation_count': len(va),
        'train_start': tr[0]['date'], 'train_end': tr[-1]['date'],
        'validation_start': va[0]['date'], 'validation_end': va[-1]['date'],
        'test_2025_reserved': True, 'source': SOURCE,
        'dataset_name': ds['name'], 'dataset_version': ds['version'],
        'dataset_sha256': ds['content_sha256'],
        'sklearn_version': sklearn.__version__, 'numpy_version': np.__version__,
        'point_in_time_features_validated': False,
        'knn_note': KNN_NOTE, 'previous_7d_definition':
            'Eventos M>=4 del snapshot ocurridos en los 7 días anteriores (excluye actual).',
    }
    def classification_metrics(y_true, y_pred, labels):
        return {
            'accuracy': round(float(accuracy_score(y_true, y_pred)), 6),
            'macro_f1': round(float(f1_score(y_true, y_pred, labels=labels, average='macro', zero_division=0)), 6),
            'per_class': classification_report(y_true, y_pred, labels=labels,
                                               output_dict=True, zero_division=0),
            'confusion_matrix': confusion_matrix(y_true, y_pred, labels=labels).tolist(),
            'labels': list(labels),
        }
    def regression_metrics(y_true, y_pred, unit):
        true = np.asarray(y_true, dtype=float)
        pred = np.asarray(y_pred, dtype=float)
        # Hasta 120 pares representativos, siempre de la validación de 2024.
        step = max(1, (len(true) + 119) // 120)
        return {'mae': round(float(mean_absolute_error(true, pred)), 6),
                'rmse': round(float(np.sqrt(mean_squared_error(true, pred))), 6),
                'r2': round(float(r2_score(true, pred)), 6), 'units': unit,
                'real_vs_estimated': [
                    {'date': va[i]['date'], 'real': round(float(true[i]), 4),
                     'estimated': round(float(pred[i]), 4)}
                    for i in range(0, len(true), step)][:120]}
    batch_id = uuid4()
    results: list[dict] = []
    def add(task, algorithm, target, names, params, metrics, baseline=False):
        results.append({
            'dataset_id': UUID(dataset_id), 'batch_id': batch_id,
            'task_type': task, 'algorithm': algorithm, 'target_name': target,
            'model_version': VERSION, 'features': list(names), 'params': dict(params, baseline=baseline),
            'metrics': metrics, 'validation_spec': validation, 'dataset_sha256': ds['content_sha256'],
            'seed': seed, 'limitations': LIMITATIONS + (' ' + KNN_NOTE if target == 'depth_class_observed' else ''),
            'status': 'completed',
        })
    def fit_regression(name, target, names, unit):
        x_train, x_val = feature_matrix(tr, names), feature_matrix(va, names)
        y_train = np.array([r[target] for r in tr], dtype=float)
        y_val = np.array([r[target] for r in va], dtype=float)
        dummy = DummyRegressor(strategy='mean').fit(x_train, y_train)
        model = LinearRegression().fit(x_train, y_train)
        target_name = 'magnitude_observed' if target == 'magnitude' else 'depth_observed'
        add('regression', 'DummyRegressor-mean-' + target, target_name, names,
            {'strategy': 'mean'}, regression_metrics(y_val, dummy.predict(x_val), unit), True)
        add('regression', name, target_name, names, {'fit_on': 'train_only'},
            regression_metrics(y_val, model.predict(x_val), unit))
    fit_regression('LinearRegression-simple', 'magnitude', ('depth',), 'magnitud instrumental sin escala especificada')
    fit_regression('LinearRegression-multiple', 'depth', ('latitude', 'longitude'), 'km de profundidad')

    xtr_knn, xva_knn = feature_matrix(tr, ('latitude', 'longitude')), feature_matrix(va, ('latitude', 'longitude'))
    ytr_knn, yva_knn = dep_label(tr), dep_label(va)
    dummy = DummyClassifier(strategy='most_frequent').fit(xtr_knn, ytr_knn)
    knn = Pipeline([('scaler', StandardScaler()),
                    ('knn', KNeighborsClassifier(n_neighbors=5, weights='distance'))])
    knn.fit(xtr_knn, ytr_knn)
    add('classification', 'DummyClassifier-most_frequent-depth', 'depth_class_observed',
        ('latitude', 'longitude'), {'strategy': 'most_frequent'},
        classification_metrics(yva_knn, dummy.predict(xva_knn), DEPTH_CLASSES), True)
    add('classification', 'KNN-binary-depth', 'depth_class_observed', ('latitude', 'longitude'),
        {'n_neighbors': 5, 'weights': 'distance', 'scaling': 'StandardScaler_fit_train_only'},
        classification_metrics(yva_knn, knn.predict(xva_knn), DEPTH_CLASSES))

    rf_names = ('latitude', 'longitude', 'depth', 'hour_utc', 'previous_7d')
    xtr_rf, xva_rf = feature_matrix(tr, rf_names), feature_matrix(va, rf_names)
    ytr_rf, yva_rf = mag_label(tr), mag_label(va)
    if any(Counter(ytr_rf)[label] < 3 for label in MAG_CLASSES):
        raise ValueError('Clases de magnitud insuficientes para Random Forest')
    base = DummyClassifier(strategy='most_frequent').fit(xtr_rf, ytr_rf)
    forest = RandomForestClassifier(n_estimators=200, max_depth=12, min_samples_leaf=5,
                                    class_weight='balanced', random_state=seed, n_jobs=1)
    forest.fit(xtr_rf, ytr_rf)
    add('classification', 'DummyClassifier-most_frequent-magnitude', 'magnitude_range_observed',
        rf_names, {'strategy': 'most_frequent'},
        classification_metrics(yva_rf, base.predict(xva_rf), MAG_CLASSES), True)
    add('classification', 'RandomForest-magnitude', 'magnitude_range_observed', rf_names,
        {'n_estimators': 200, 'max_depth': 12, 'min_samples_leaf': 5,
         'class_weight': 'balanced', 'random_state': seed, 'previous_days': 7},
        classification_metrics(yva_rf, forest.predict(xva_rf), MAG_CLASSES))

    # Evita registrar resultados incompletos ante problemas en cualquiera de los modelos.
    with engine.begin() as conn:
        conn.execute(ml_experiments.insert(), [dict(row, id=uuid4()) for row in results])
    return {'inspection': check, 'batch_id': str(batch_id),
            'experiments': [{**r, 'dataset_id': str(r['dataset_id']), 'batch_id': str(r['batch_id'])}
                            for r in results]}
