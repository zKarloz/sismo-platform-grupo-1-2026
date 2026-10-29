"""Solo lectura de resultados retrospectivos IGP; USGS legado queda archivado.

No existe endpoint para entrenar ni para crear estimaciones de sismos futuros.
"""
from typing import Literal
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_read_engine
from app.db.tables import (datasets, historical_snapshot_rows, ml_experiments,
                           ml_validation_predictions)
from app.quality.historical import KIND, SOURCE

router = APIRouter(prefix='/ml', tags=['Experimentos retrospectivos'])


@router.get('/experiments')
def list_experiments(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    dataset_id: UUID | None = None, batch_id: UUID | None = None,
    task_type: Literal['classification', 'regression'] | None = None,
    engine: Engine = Depends(get_read_engine),
) -> dict:
    """Filtra origen IGP en SQL, no solo en React; orden estable y paginación real."""
    where = [datasets.c.query_spec['source'].as_string() == SOURCE,
             datasets.c.query_spec['dataset_kind'].as_string() == KIND]
    if dataset_id is not None:
        where.append(ml_experiments.c.dataset_id == dataset_id)
    if batch_id is not None:
        where.append(ml_experiments.c.batch_id == batch_id)
    if task_type is not None:
        where.append(ml_experiments.c.task_type == task_type)
    join = ml_experiments.join(datasets, ml_experiments.c.dataset_id == datasets.c.id)
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(join).where(*where)).scalar_one()
            records = conn.execute(select(
                ml_experiments.c.id, ml_experiments.c.batch_id, ml_experiments.c.dataset_id,
                datasets.c.name.label('dataset_name'), datasets.c.version.label('dataset_version'),
                ml_experiments.c.task_type, ml_experiments.c.algorithm,
                ml_experiments.c.target_name, ml_experiments.c.model_version,
                ml_experiments.c.features, ml_experiments.c.params,
                ml_experiments.c.metrics, ml_experiments.c.validation_spec,
                ml_experiments.c.dataset_sha256, ml_experiments.c.seed,
                ml_experiments.c.limitations, ml_experiments.c.created_at,
            ).select_from(join).where(*where)
                .order_by(ml_experiments.c.created_at.desc(), ml_experiments.c.id.desc())
                .offset((page - 1) * page_size).limit(page_size)).mappings().all()
    except SQLAlchemyError:
        raise HTTPException(503, 'Experimentos no disponibles; verificar migraciones ML') from None
    return {'items': [dict(r) for r in records], 'total': total,
            'page': page, 'page_size': page_size,
            'disclaimer': 'Resultados experimentales retrospectivos IGP. No predicción ni alerta oficial.'}


@router.get('/experiments/{experiment_id}/predictions')
def validation_predictions(
    experiment_id: UUID,
    page: int = Query(1, ge=1), page_size: int = Query(1000, ge=1, le=1000),
    engine: Engine = Depends(get_read_engine),
) -> dict:
    """Solo los pares de validación IGP 2024, vinculados al experimento real.

    El acceso es GET; no reentrena ni expone datos operativos o el holdout 2025.
    """
    from app.db.tables import ml_validation_predictions
    joined = (ml_validation_predictions.join(ml_experiments,
              ml_validation_predictions.c.experiment_id == ml_experiments.c.id)
              .join(datasets, ml_experiments.c.dataset_id == datasets.c.id))
    filters = [ml_validation_predictions.c.experiment_id == experiment_id,
               ml_validation_predictions.c.dataset_id == datasets.c.id,
               datasets.c.query_spec['source'].as_string() == SOURCE,
               datasets.c.query_spec['dataset_kind'].as_string() == KIND,
               ml_experiments.c.dataset_sha256 == datasets.c.content_sha256,
               ml_validation_predictions.c.split == 'validation']
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(joined).where(*filters)).scalar_one()
            records = conn.execute(select(
                ml_validation_predictions.c.source_row,
                ml_validation_predictions.c.occurred_at,
                ml_validation_predictions.c.actual_value,
                ml_validation_predictions.c.predicted_value,
            ).select_from(joined).where(*filters)
                .order_by(ml_validation_predictions.c.occurred_at,
                          ml_validation_predictions.c.source_row)
                .limit(page_size).offset((page - 1) * page_size)).mappings().all()
    except SQLAlchemyError:
        raise HTTPException(503, 'Predicciones no disponibles; aplicar migración ML IGP 02') from None
    return {'experiment_id': str(experiment_id), 'total': total,
            'page': page, 'page_size': page_size,
            'split': 'validation', 'year': 2024,
            'items': [dict(row) for row in records]}


def _estimate_scope(
    dataset_id: UUID | None = None,
    batch_id: UUID | None = None,
    task_type: Literal['classification', 'regression'] | None = None,
):
    """Predicado único para resumen y detalle: IGP, 2024, sin baselines."""
    p = ml_validation_predictions
    ex = ml_experiments
    hist = historical_snapshot_rows
    joined = (p.join(ex, (p.c.experiment_id == ex.c.id) &
                     (p.c.dataset_id == ex.c.dataset_id))
              .join(datasets, ex.c.dataset_id == datasets.c.id)
              .join(hist, (p.c.dataset_id == hist.c.dataset_id) &
                    (p.c.source_row == hist.c.source_row)))
    where = [
        datasets.c.query_spec['source'].as_string() == SOURCE,
        datasets.c.query_spec['dataset_kind'].as_string() == KIND,
        ex.c.dataset_sha256 == datasets.c.content_sha256,
        ex.c.params['baseline'].as_boolean() == False,  # noqa: E712 (SQL)
        p.c.split == 'validation', hist.c.split == 'validation',
        hist.c.record['source_name'].as_string() == SOURCE,
        p.c.occurred_at >= datetime(2024, 1, 1, tzinfo=timezone.utc),
        p.c.occurred_at < datetime(2025, 1, 1, tzinfo=timezone.utc),
    ]
    if dataset_id is not None:
        where.append(ex.c.dataset_id == dataset_id)
    if batch_id is not None:
        where.append(ex.c.batch_id == batch_id)
    if task_type is not None:
        where.append(ex.c.task_type == task_type)
    return joined, where


@router.get('/estimates/summary')
def estimate_summary(
    dataset_id: UUID | None = None, batch_id: UUID | None = None,
    task_type: Literal['classification', 'regression'] | None = None,
    engine: Engine = Depends(get_read_engine),
) -> dict:
    """Resumen de todos los pares elegibles, nunca de una página parcial.

    El contador de eventos cuenta pares distintos (dataset, fila Excel),
    por lo que no confunde cuatro salidas de modelos con cuatro sismos.
    Las métricas vienen de experimentos registrados, no de predicciones inventadas.
    """
    joined, where = _estimate_scope(dataset_id, batch_id, task_type)
    p, ex = ml_validation_predictions, ml_experiments
    per_model = (select(ex.c.id.label('experiment_id'),
                        func.count().label('total'))
                 .select_from(joined).where(*where)
                 .group_by(ex.c.id).subquery())
    distinct_events = (select(p.c.dataset_id, p.c.source_row)
                       .select_from(joined).where(*where)
                       .group_by(p.c.dataset_id, p.c.source_row).subquery())
    try:
        with engine.connect() as conn:
            records = conn.execute(select(
                ex.c.id, ex.c.batch_id, ex.c.algorithm, ex.c.model_version,
                ex.c.task_type, ex.c.target_name, ex.c.metrics,
                per_model.c.total,
            ).join(per_model, ex.c.id == per_model.c.experiment_id)
                .order_by(ex.c.created_at.desc(), ex.c.algorithm, ex.c.id)).mappings().all()
            event_count = conn.execute(select(func.count())
                                       .select_from(distinct_events)).scalar_one()
    except SQLAlchemyError:
        raise HTTPException(503, 'Resumen IGP no disponible; comprobar predicciones') from None
    models = [{
        'experiment_id': str(row['id']), 'batch_id': str(row['batch_id']),
        'algorithm': row['algorithm'], 'model_version': row['model_version'],
        'task_type': row['task_type'], 'target_name': row['target_name'],
        'total': row['total'],
        'primary_metric': 'mae' if row['task_type'] == 'regression' else 'macro_f1',
        'primary_value': (row['metrics'] or {}).get(
            'mae' if row['task_type'] == 'regression' else 'macro_f1'),
    } for row in records]
    return {
        'total_estimates': sum(row['total'] for row in records),
        'unique_events': event_count, 'total_models': len(models),
        'models': models, 'year': 2024, 'split': 'validation',
        'note': 'Sismos ya ocurridos; resumen de validación, no predicción ni alerta oficial.',
    }


@router.get('/estimates')
def retrospective_estimates(
    page: int = Query(1, ge=1), page_size: int = Query(5, ge=1, le=20),
    dataset_id: UUID | None = None, batch_id: UUID | None = None,
    task_type: Literal['classification', 'regression'] | None = None,
    experiment_id: UUID | None = None,
    engine: Engine = Depends(get_read_engine),
) -> dict:
    """Vista NO PUBLICADA de valores estimados para sismos reales de 2024.

    Solo modelos (no baselines) y filas congeladas IGP con split validation.
    El error a posteriori no es una banda predictiva; no existen probabilidades
    calibradas, aprobaciones persistidas ni cálculos sobre sismos futuros.
    """
    p, ex, hist = ml_validation_predictions, ml_experiments, historical_snapshot_rows
    joined, where = _estimate_scope(dataset_id, batch_id, task_type)
    if experiment_id is not None:
        # Filtro de detalle: también se evalúa desde FastAPI, no solo en React.
        where.append(ex.c.id == experiment_id)
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(joined).where(*where)).scalar_one()
            rows = conn.execute(select(
                p.c.experiment_id, p.c.source_row, p.c.occurred_at,
                p.c.actual_value, p.c.predicted_value,
                ex.c.algorithm, ex.c.task_type, ex.c.target_name, ex.c.model_version,
                ex.c.batch_id, ex.c.created_at.label('experiment_registered_at'),
                ex.c.limitations, datasets.c.name.label('dataset_name'),
                datasets.c.version.label('dataset_version'), hist.c.record,
            ).select_from(joined).where(*where)
                .order_by(p.c.occurred_at.desc(), p.c.experiment_id, p.c.source_row)
                .offset((page - 1) * page_size).limit(page_size)).mappings().all()
    except SQLAlchemyError:
        raise HTTPException(503, 'Estimaciones retrospectivas no disponibles; verificar predicciones IGP') from None

    items = []
    for row in rows:
        record = row['record'] or {}
        regression = row['task_type'] == 'regression'
        actual, estimated = row['actual_value'], row['predicted_value']
        # Error medido DESPUÉS de observar el sismo; nunca un intervalo
        # de incertidumbre anticipado ni una probabilidad calibrada.
        error = abs(float(actual) - float(estimated)) if regression else None
        items.append({
            'experiment_id': str(row['experiment_id']), 'batch_id': str(row['batch_id']),
            'dataset_name': row['dataset_name'], 'dataset_version': row['dataset_version'],
            'algorithm': row['algorithm'], 'model_version': row['model_version'],
            'task_type': row['task_type'], 'target_name': row['target_name'],
            'source_row': row['source_row'], 'occurred_at': row['occurred_at'],
            'latitude': record.get('latitude'), 'longitude': record.get('longitude'),
            'actual_value': actual, 'predicted_value': estimated,
            'absolute_error': round(error, 6) if error is not None else None,
            'correct_classification': actual == estimated if not regression else None,
            'probability': None, 'prediction_interval': None,
            'uncertainty_note': 'Error observado a posteriori; sin intervalo calibrado' if regression
                else 'Sin probabilidades calibradas para esta clasificación',
            'experiment_registered_at': row['experiment_registered_at'],
            'calculated_at': None,  # No se guardó la fecha individual del backfill.
            'review_status': 'not_reviewed', 'published': False,
            'limitations': row['limitations'],
            'warning': 'Validación retrospectiva IGP 2024. No predice sismos futuros ni genera alertas oficiales.',
        })
    return {
        'items': items, 'total': total, 'page': page, 'page_size': page_size,
        'year': 2024, 'split': 'validation', 'review_status': 'not_reviewed',
        'disclaimer': 'Solo validación retrospectiva; sin revisión formal, publicación ni alertas oficiales.',
    }


@router.get('/final-evaluations')
def final_evaluations(batch_id: UUID | None = None,
                      engine: Engine = Depends(get_read_engine)) -> dict:
    """Resumen AUDITABLE de la prueba 2025, solo si ya fue registrada.

    No consulta el XLSX ni entrena: devuelve exclusivamente métricas persistidas.
    Se verifica el SHA-256 de las filas inmutables cada vez que se lee el reporte.
    """
    from app.db.tables import (dataset_reviews, ml_final_batches,
                               ml_final_holdout_rows, ml_final_evaluations)
    from app.quality.report import content_sha256

    batches = ml_final_batches.join(datasets,
        ml_final_batches.c.dataset_id == datasets.c.id).join(
        dataset_reviews, dataset_reviews.c.dataset_id == datasets.c.id)
    scope = [datasets.c.query_spec['source'].as_string() == SOURCE,
             datasets.c.query_spec['dataset_kind'].as_string() == KIND,
             dataset_reviews.c.decision == 'approved',
             dataset_reviews.c.dataset_sha256 == datasets.c.content_sha256,
             ml_final_batches.c.dataset_sha256 == datasets.c.content_sha256]
    if batch_id is not None:
        scope.append(ml_final_batches.c.batch_id == batch_id)
    try:
        with engine.connect() as conn:
            records = conn.execute(select(ml_final_batches).select_from(batches)
                .where(*scope).order_by(ml_final_batches.c.evaluated_at.desc())).mappings().all()
            results = []
            for record in records:
                frozen = conn.execute(select(ml_final_holdout_rows.c.record)
                    .where(ml_final_holdout_rows.c.batch_id == record['batch_id'])
                    .order_by(ml_final_holdout_rows.c.position)).scalars().all()
                if (len(frozen) != record['test_count'] or
                        content_sha256(frozen) != record['holdout_sha256']):
                    raise HTTPException(409, 'Integridad del conjunto IGP 2025 no coincide')
                evaluations = conn.execute(select(ml_final_evaluations)
                    .where(ml_final_evaluations.c.batch_id == record['batch_id'])
                    .order_by(ml_final_evaluations.c.algorithm)).mappings().all()
                if len(evaluations) != 8:
                    raise HTTPException(409, 'Prueba final incompleta')
                results.append({
                    'batch_id': str(record['batch_id']), 'dataset_id': str(record['dataset_id']),
                    'year': 2025, 'test_count': record['test_count'],
                    'development_count': record['development_count'],
                    'evaluated_at': record['evaluated_at'],
                    'method': record['method'], 'sha256': record['holdout_sha256'],
                    'models': [{'experiment_id': str(value['experiment_id']),
                                'algorithm': value['algorithm'], 'metrics': value['metrics']}
                               for value in evaluations],
                })
    except SQLAlchemyError:
        raise HTTPException(503, 'Evaluación final temporalmente no disponible') from None
    return {'items': results, 'total': len(results),
            'disclaimer': 'Evaluación retrospectiva única IGP 2025; no predice sismos ni activa alertas.'}
