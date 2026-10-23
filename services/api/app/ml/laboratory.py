"""Entrenamiento retrospectivo REPRODUCIBLE sobre una copia inmutable.

No es pronóstico sísmico: los atributos y etiquetas son mediciones de un
sismo ya ocurrido. No entrenar con estimaciones del estado futuro del evento.
"""
from collections import Counter
from datetime import datetime, timezone
from math import ceil, isfinite
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.engine import Engine

from app.db.tables import datasets, ml_experiments, snapshot_rows
from app.quality.report import content_sha256

CLASSES = ("2.5–<4.0", "4.0–<5.0", "≥5.0")
FEATURES = ("latitude", "longitude", "depth_km")
VERSION = "retrospectivo-v1"
MIN_ROWS = 60
MIN_PER_CLASS_TRAIN = 3
LIMITATION = (
    "Solo análisis retrospectivo de eventos USGS observados; clase y magnitud son "
    "mediciones reportadas. No anticipa terremotos ni representa riesgo o alerta. "
    "Registros revisados pueden contener valores corregidos después del evento; "
    "no se ha validado disponibilidad punto-en-tiempo ni utilidad operativa. "
    "Cobertura/catálogo e independencia de réplicas limitan la generalización. "
    "Requiere revisión de un especialista en sismología."
)


def magnitude_class(value: float) -> str:
    """Etiquetas didácticas: no corresponden a categorías oficiales de peligro."""
    if value < 2.5:
        raise ValueError("Magnitud menor que 2.5; dataset incompatible")
    return CLASSES[0] if value < 4.0 else CLASSES[1] if value < 5.0 else CLASSES[2]


def load_snapshot(engine: Engine, dataset_id: str) -> tuple[dict, list[dict]]:
    """Lee copia congelada y comprueba hash; nunca usa seismic_events actual."""
    with engine.connect() as conn:
        ds = conn.execute(select(datasets).where(datasets.c.id == UUID(dataset_id))).mappings().first()
        if ds is None:
            raise ValueError("Dataset inexistente")
        rows = conn.execute(select(snapshot_rows.c.record).where(
            snapshot_rows.c.dataset_id == UUID(dataset_id)
        ).order_by(snapshot_rows.c.position)).scalars().all()
    if len(rows) != ds['row_count'] or content_sha256(rows) != ds['content_sha256']:
        raise ValueError("Dataset no verificable: conteo o SHA-256 no coincide")
    return dict(ds), rows


def _utc(raw: str) -> datetime:
    t = datetime.fromisoformat(raw.replace('Z', '+00:00'))
    if t.tzinfo is None:
        raise ValueError("Registro sin timezone UTC")
    return t.astimezone(timezone.utc)


def prepare(rows: list[dict], ratio: float = 0.2) -> dict:
    """Descarta filas incompletas del target y divide por tiempo SIN mezclar.

    Ningún feature puede ser magnitud, clase, identificador, estado de revisión,
    source_updated_at, received_at, ni datos agregados de eventos posteriores.
    """
    if not 0.1 <= ratio <= 0.4:
        raise ValueError("test_ratio debe estar entre 0.10 y 0.40")
    clean: list[tuple[datetime, str, dict]] = []
    seen: set[tuple[str, str]] = set()
    rejected = Counter()
    for r in rows:
        key = (str(r.get('source_id')), str(r.get('external_id')))
        if key in seen:
            raise ValueError("Dataset contiene eventos duplicados")
        seen.add(key)
        if r.get('source_name') != 'USGS':
            raise ValueError("Por ahora solo se permite dataset homogéneo USGS")
        mag = r.get('magnitude')
        if type(mag) not in (int, float) or not isfinite(mag) or mag < 2.5 or mag > 12:
            rejected['magnitude_invalid_or_missing'] += 1
            continue
        lat, lon = r.get('latitude'), r.get('longitude')
        if (type(lat) not in (int, float) or type(lon) not in (int, float)
                or not isfinite(lat) or not isfinite(lon) or not -90 <= lat <= 90
                or not -180 <= lon <= 180):
            rejected['coordinates_invalid_or_missing'] += 1
            continue
        depth = r.get('depth_km')
        if depth is not None and (type(depth) not in (int, float) or not isfinite(depth)
                                  or not -20 <= depth <= 1000):
            rejected['depth_invalid'] += 1
            continue
        try:
            when = _utc(r['occurred_at'])
        except (TypeError, ValueError, KeyError):
            rejected['occurred_at_invalid'] += 1
            continue
        clean.append((when, str(r.get('external_id')), r))

    clean.sort(key=lambda item: (item[0], item[1]))
    if len(clean) < MIN_ROWS:
        raise ValueError(f"Muestra insuficiente: {len(clean)} válidos. Mínimo {MIN_ROWS}; amplía histórico")
    cut = len(clean) - max(1, ceil(len(clean) * ratio))
    # No dividir sismos con EXACTAMENTE la misma marca de tiempo.
    while cut > 0 and cut < len(clean) and clean[cut - 1][0] == clean[cut][0]:
        cut -= 1
    if cut < 1 or len(clean) - cut < 1:
        raise ValueError("No es posible establecer un corte cronológico sin empates")
    train, test = clean[:cut], clean[cut:]
    y_train = [magnitude_class(float(r['magnitude'])) for _, _, r in train]
    y_test = [magnitude_class(float(r['magnitude'])) for _, _, r in test]
    counts_train, counts_test = Counter(y_train), Counter(y_test)
    if any(counts_train[k] < MIN_PER_CLASS_TRAIN for k in CLASSES):
        raise ValueError("Clases insuficientes en entrenamiento: " + str(dict(counts_train)) +
                         f". Se requieren al menos {MIN_PER_CLASS_TRAIN} por clase; amplía histórico")
    # El test puede carecer de una clase: no inventar ejemplos; advertir y reportar.
    notes = [f"Clase {name} ausente en test" for name in CLASSES if counts_test[name] == 0]
    def features(items: list[tuple]) -> list[list[float]]:
        return [[float(r['latitude']), float(r['longitude']),
                 float(r['depth_km']) if r['depth_km'] is not None else float('nan')]
                for _, _, r in items]
    return {
        'X_train': features(train), 'X_test': features(test),
        'y_train': y_train, 'y_test': y_test,
        'mag_train': [float(r['magnitude']) for _, _, r in train],
        'mag_test': [float(r['magnitude']) for _, _, r in test],
        'train_start': train[0][0].isoformat(), 'train_end': train[-1][0].isoformat(),
        'test_start': test[0][0].isoformat(), 'test_end': test[-1][0].isoformat(),
        'train_count': len(train), 'test_count': len(test),
        'class_counts_train': {k: counts_train[k] for k in CLASSES},
        'class_counts_test': {k: counts_test[k] for k in CLASSES},
        'excluded': dict(rejected), 'warnings': notes,
    }


def _run_models(data: dict, *, seed: int, ratio: float, ds: dict) -> list[dict]:
    """Importación tardía: Render no instala scikit-learn, solo el CLI local."""
    import numpy as np
    import sklearn
    from sklearn.dummy import DummyClassifier, DummyRegressor
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression, LinearRegression
    from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                                 f1_score, mean_absolute_error, mean_squared_error, r2_score)
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    xtr = np.asarray(data['X_train'], dtype=float)
    xte = np.asarray(data['X_test'], dtype=float)
    ytr, yte = data['y_train'], data['y_test']
    regtr, regte = np.asarray(data['mag_train']), np.asarray(data['mag_test'])
    common_validation = {
        'method': 'holdout_cronologico_sin_shuffle', 'test_ratio_requested': ratio,
        'train_count': data['train_count'], 'test_count': data['test_count'],
        'train_start': data['train_start'], 'train_end': data['train_end'],
        'test_start': data['test_start'], 'test_end': data['test_end'],
        'class_counts_train': data['class_counts_train'], 'class_counts_test': data['class_counts_test'],
        'excluded': data['excluded'], 'warnings': data['warnings'],
        'dataset_version': ds['version'], 'dataset_name': ds['name'],
        'source': 'USGS', 'snapshot_sha256': ds['content_sha256'],
        'numpy_version': np.__version__, 'sklearn_version': sklearn.__version__,
        'code_version': VERSION, 'no_future_features': True,
        'point_in_time_features_validated': False,
    }
    def cl_metrics(pred):
        return {
            'accuracy': round(float(accuracy_score(yte, pred)), 6),
            'macro_f1': round(float(f1_score(yte, pred, labels=CLASSES, average='macro', zero_division=0)), 6),
            'per_class': classification_report(yte, pred, labels=CLASSES, output_dict=True, zero_division=0),
            'confusion_matrix': confusion_matrix(yte, pred, labels=CLASSES).tolist(),
            'labels': list(CLASSES),
        }
    def reg_metrics(pred):
        return {
            'mae': round(float(mean_absolute_error(regte, pred)), 6),
            'rmse': round(float(np.sqrt(mean_squared_error(regte, pred))), 6),
            'r2': round(float(r2_score(regte, pred)), 6) if len(regte) >= 2 else None,
            'units': 'escala de magnitud reportada; mezcla de tipos de magnitud en la fuente',
        }
    def entry(task: str, algorithm: str, features: list[str], params: dict, metrics: dict):
        return {
            'task_type': task, 'algorithm': algorithm,
            'target_name': 'magnitude_range_observed' if task == 'classification' else 'magnitude_observed',
            'model_version': VERSION, 'features': features,
            'params': params, 'metrics': metrics, 'validation_spec': common_validation,
            'seed': seed, 'limitations': LIMITATION, 'status': 'completed',
        }

    out: list[dict] = []
    base = DummyClassifier(strategy='most_frequent')
    base.fit(xtr, ytr)
    out.append(entry('classification', 'DummyClassifier-most_frequent', list(FEATURES),
                     {'strategy': 'most_frequent'}, cl_metrics(base.predict(xte))))

    classification = Pipeline([
        ('impute', SimpleImputer(strategy='median', keep_empty_features=True)),
        ('scale', StandardScaler()),
        ('model', LogisticRegression(max_iter=2000, random_state=seed)),
    ])
    classification.fit(xtr, ytr)
    out.append(entry('classification', 'LogisticRegression', list(FEATURES),
                     {'max_iter': 2000, 'imputation': 'median_fit_train_only', 'standardization': 'fit_train_only'},
                     cl_metrics(classification.predict(xte))))

    rb = DummyRegressor(strategy='mean')
    rb.fit(xtr, regtr)
    out.append(entry('regression', 'DummyRegressor-mean', list(FEATURES),
                     {'strategy': 'mean'}, reg_metrics(rb.predict(xte))))

    for name, indices, feats in [
        ('LinearRegression-simple', [2], ['depth_km']),
        ('LinearRegression-multiple', [0, 1, 2], list(FEATURES)),
    ]:
        model = Pipeline([
            ('impute', SimpleImputer(strategy='median', keep_empty_features=True)),
            ('scale', StandardScaler()),
            ('model', LinearRegression()),
        ])
        model.fit(xtr[:, indices], regtr)
        out.append(entry('regression', name, feats,
                         {'imputation': 'median_fit_train_only', 'standardization': 'fit_train_only'},
                         reg_metrics(model.predict(xte[:, indices]))))
    return out


def experiment(engine: Engine, dataset_id: str, *, seed: int = 42,
               test_ratio: float = 0.2, check_only: bool = False) -> dict:
    """Cinco comparaciones, todas sobre el MISMO corte; una transacción de escritura."""
    if not 0 <= seed <= 2**31 - 1:
        raise ValueError('Semilla fuera de rango')
    ds, rows = load_snapshot(engine, dataset_id)
    if ds['quality_report'].get('status') == 'review':
        raise ValueError('Dataset con problemas de calidad: revisar antes de ML')
    data = prepare(rows, test_ratio)
    inspection = {key: data[key] for key in (
        'train_count', 'test_count', 'train_start', 'train_end', 'test_start', 'test_end',
        'class_counts_train', 'class_counts_test', 'excluded', 'warnings')}
    inspection.update({'dataset_id': dataset_id, 'dataset_version': ds['version'],
                       'dataset_name': ds['name'], 'dataset_sha256': ds['content_sha256']})
    if check_only:
        return {'inspection': inspection, 'experiments': [], 'batch_id': None}
    rows_out = _run_models(data, seed=seed, ratio=test_ratio, ds=ds)
    batch_id = uuid4()
    with engine.begin() as conn:
        conn.execute(ml_experiments.insert(), [dict(item, id=uuid4(), batch_id=batch_id,
                     dataset_id=UUID(dataset_id), dataset_sha256=ds['content_sha256'])
                     for item in rows_out])
    return {'inspection': inspection, 'experiments': rows_out, 'batch_id': str(batch_id)}
