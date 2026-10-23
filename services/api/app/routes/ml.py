"""Solo metadatos y métricas retrospectivas. Ninguna ruta de entrenamiento."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_read_engine
from app.db.tables import datasets, ml_experiments

router = APIRouter(prefix='/ml', tags=['Experimentos retrospectivos'])


@router.get('/experiments')
def list_experiments(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                     dataset_id: UUID | None = None, engine: Engine = Depends(get_read_engine)) -> dict:
    """Compara experimentos sobre el mismo batch; no publica artefactos serializados."""
    where = [ml_experiments.c.dataset_id == dataset_id] if dataset_id else []
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(ml_experiments).where(*where)).scalar_one()
            records = conn.execute(select(
                ml_experiments.c.id, ml_experiments.c.batch_id,
                ml_experiments.c.dataset_id, datasets.c.name.label('dataset_name'),
                datasets.c.version.label('dataset_version'),
                ml_experiments.c.task_type, ml_experiments.c.algorithm,
                ml_experiments.c.target_name, ml_experiments.c.model_version,
                ml_experiments.c.features, ml_experiments.c.params,
                ml_experiments.c.metrics, ml_experiments.c.validation_spec,
                ml_experiments.c.dataset_sha256, ml_experiments.c.seed,
                ml_experiments.c.limitations, ml_experiments.c.created_at,
            ).join(datasets, ml_experiments.c.dataset_id == datasets.c.id)
                .where(*where).order_by(ml_experiments.c.created_at.desc(), ml_experiments.c.id.desc())
                .offset((page-1)*page_size).limit(page_size)).mappings().all()
    except SQLAlchemyError:
        raise HTTPException(503, 'Experimentos no disponibles; verifica la migración 003') from None
    return {'items': [dict(r) for r in records], 'total': total, 'page': page, 'page_size': page_size,
            'disclaimer': 'Análisis de sismos ya ocurridos. No es predicción ni alerta sísmica.'}
