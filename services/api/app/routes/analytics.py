"""Agregaciones SQL descriptivas de sismos ya observados.

Los indicadores no son pronósticos ni mediciones de peligrosidad. Una fuente
solo incluye registros sincronizados a PostgreSQL, nunca el universo completo.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, extract, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_read_engine
from app.db.tables import alert_rules, alerts, events, runs, sources
from app.routes.filters import SeismicFilters, get_filters

analytics_router = APIRouter(prefix="/analytics", tags=["Análisis descriptivo"])
dashboard_router = APIRouter(prefix="/dashboard", tags=["Dashboard"])
JOIN = events.join(sources, events.c.source_id == sources.c.id)


def _safe_query_error() -> HTTPException:
    # No exponer SQL, hostname de Supabase ni credenciales en la respuesta HTTP.
    return HTTPException(503, "Datos analíticos temporalmente no disponibles")


@dashboard_router.get("/summary")
def summary(
    filters: SeismicFilters = Depends(get_filters), engine: Engine = Depends(get_read_engine),
) -> dict:
    """KPIs calculados sobre TODO el conjunto filtrado, sin cargar filas en Python."""
    try:
        with engine.connect() as conn:
            stats = conn.execute(
                select(
                    func.count().label("total"),
                    func.count(events.c.magnitude).label("with_magnitude"),
                    func.count(events.c.depth_km).label("with_depth"),
                    func.max(events.c.magnitude).label("max_magnitude"),
                    func.avg(events.c.depth_km).label("avg_depth_km"),
                    func.max(events.c.occurred_at).label("latest_event_at"),
                ).select_from(JOIN).where(*filters.conditions())
            ).mappings().one()
            # Mediana real, sin transferir decenas de miles de profundidades a Python.
            # Una ventana SQL permite la misma implementación en PostgreSQL y SQLite.
            ranked = select(
                events.c.depth_km.label('depth'),
                func.row_number().over(order_by=events.c.depth_km).label('pos'),
                func.count().over().label('n'),
            ).select_from(JOIN).where(*filters.conditions(), events.c.depth_km.is_not(None)).subquery()
            median = conn.execute(
                select(func.avg(ranked.c.depth)).where(
                    func.abs(ranked.c.pos - (ranked.c.n + 1) / 2.0) < 1
                )
            ).scalar_one()
    except SQLAlchemyError:
        raise _safe_query_error() from None
    return {
        "total": stats["total"],
        "with_magnitude": stats["with_magnitude"],
        "with_depth": stats["with_depth"],
        "max_magnitude": stats["max_magnitude"],
        "avg_depth_km": round(float(stats["avg_depth_km"]), 1) if stats["avg_depth_km"] is not None else None,
        "latest_event_at": stats["latest_event_at"],
        "median_depth_km": round(float(median), 1) if median is not None else None,
    }


@dashboard_router.get('/operations')
def dashboard_operations(engine: Engine = Depends(get_read_engine)) -> dict:
    """Operación IGP registrada: pendientes reales, estado y duración de ingesta.

    No expone reglas, destinatarios ni avisos individuales; los estados
    pending/approved son tareas abiertas, mientras que sent es historial.
    """
    igp_name = func.lower(sources.c.name) == 'igp/censis'
    try:
        with engine.connect() as conn:
            alert_count = conn.execute(
                select(func.count()).select_from(
                    alerts.join(events, alerts.c.event_id == events.c.id)
                    .join(sources, events.c.source_id == sources.c.id)
                ).where(igp_name, alerts.c.status.in_(['pending', 'approved']))
            ).scalar_one()
            active_rules = conn.execute(
                select(func.count()).select_from(
                    alert_rules.join(sources, alert_rules.c.source_id == sources.c.id)
                ).where(igp_name, alert_rules.c.enabled.is_(True))
            ).scalar_one()
            source = conn.execute(
                select(sources.c.id, sources.c.status, sources.c.last_success_at)
                .where(igp_name).limit(1)
            ).mappings().first()
            latest_arrival = conn.execute(
                select(events.c.occurred_at, events.c.received_at)
                .select_from(JOIN)
                .where(igp_name, events.c.received_at.is_not(None))
                .order_by(events.c.occurred_at.desc()).limit(1)
            ).first()
            last_run = None
            if source:
                last_run = conn.execute(
                    select(runs.c.started_at, runs.c.finished_at, runs.c.status,
                           runs.c.records_seen, runs.c.records_inserted,
                           runs.c.records_updated)
                    .where(runs.c.source_id == source['id'])
                    .order_by(runs.c.started_at.desc()).limit(1)
                ).mappings().first()
    except SQLAlchemyError:
        raise _safe_query_error() from None
    # Tiempo evento -> recepción en nuestra BD. Puede incluir conciliaciones
    # históricas; no es un SLA ni la latencia propia del servicio ArcGIS.
    lag = None
    if latest_arrival:
        seconds = (latest_arrival.received_at - latest_arrival.occurred_at).total_seconds()
        if seconds >= 0:
            lag = round(seconds / 60, 1)
    return {
        'latest_event_ingestion_lag_minutes': lag,
        'open_alerts': alert_count,
        'enabled_rules': active_rules,
        'connector_status': source['status'] if source else None,
        'last_success_at': source['last_success_at'] if source else None,
        'last_run': dict(last_run) if last_run else None,
    }


@analytics_router.get("/timeseries")
def timeseries(
    interval: str = Query("day", pattern="^(day|month)$"),
    filters: SeismicFilters = Depends(get_filters),
    engine: Engine = Depends(get_read_engine),
) -> dict:
    """Agrupa en UTC por día o mes; no rellena periodos sin eventos."""
    try:
        with engine.connect() as conn:
            if interval == "day":
                bucket = func.date(events.c.occurred_at)
                rows = conn.execute(
                    select(bucket.label("bucket"), func.count().label("count"))
                    .select_from(JOIN).where(*filters.conditions())
                    .group_by(bucket).order_by(bucket)
                ).all()
                points = [{"period": str(row.bucket), "count": row.count} for row in rows]
            else:
                year = extract("year", events.c.occurred_at)
                month = extract("month", events.c.occurred_at)
                rows = conn.execute(
                    select(year.label("year"), month.label("month"), func.count().label("count"))
                    .select_from(JOIN).where(*filters.conditions())
                    .group_by(year, month).order_by(year, month)
                ).all()
                points = [{"period": f"{int(row.year):04d}-{int(row.month):02d}", "count": row.count} for row in rows]
    except SQLAlchemyError:
        raise _safe_query_error() from None
    return {"interval": interval, "timezone": "UTC", "items": points, "total": sum(p["count"] for p in points)}


BUCKETS = (
    ("< 3", 0), ("3–3.9", 1), ("4–4.9", 2),
    ("5–5.9", 3), ("≥ 6", 4), ("Sin dato", 5),
)


@analytics_router.get("/magnitudes")
def magnitudes(
    filters: SeismicFilters = Depends(get_filters), engine: Engine = Depends(get_read_engine),
) -> dict:
    """Distribución por rangos no equivalentes a una escala de alerta."""
    magnitude = events.c.magnitude
    category = case(
        (magnitude.is_(None), 5), (magnitude < 3, 0),
        (magnitude < 4, 1), (magnitude < 5, 2), (magnitude < 6, 3),
        else_=4,
    )
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                select(category.label("bucket"), func.count().label("count"))
                .select_from(JOIN).where(*filters.conditions()).group_by(category)
            ).all()
    except SQLAlchemyError:
        raise _safe_query_error() from None
    counts = {int(row.bucket): row.count for row in rows}
    return {"items": [{"range": label, "count": counts.get(index, 0)} for label, index in BUCKETS],
            "total": sum(counts.values())}


@analytics_router.get("/depth-vs-magnitude")
def depth_vs_magnitude(
    limit: int = Query(500, ge=1, le=1000),
    filters: SeismicFilters = Depends(get_filters), engine: Engine = Depends(get_read_engine),
) -> dict:
    """Hasta 1 000 registros más recientes con ambas medidas disponibles.

    La muestra temporal NO representa necesariamente todo el catálogo.
    """
    conditions = [*filters.conditions(), events.c.depth_km.is_not(None), events.c.magnitude.is_not(None)]
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(JOIN).where(*conditions)).scalar_one()
            rows = conn.execute(
                select(events.c.id, events.c.magnitude, events.c.depth_km, events.c.occurred_at)
                .select_from(JOIN).where(*conditions)
                .order_by(events.c.occurred_at.desc(), events.c.id.desc()).limit(limit)
            ).all()
    except SQLAlchemyError:
        raise _safe_query_error() from None
    return {"total": total, "returned": len(rows), "truncated": total > len(rows), "sample": "most_recent",
            "items": [{"id": str(r.id), "magnitude": r.magnitude, "depth_km": r.depth_km,
                       "occurred_at": r.occurred_at} for r in rows]}
