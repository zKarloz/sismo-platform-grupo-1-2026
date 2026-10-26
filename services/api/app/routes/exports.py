"""Exportación CSV de registros observados. Máximo de 5 000 filas por descarga."""

import csv
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_read_engine
from app.db.tables import events, sources, audit_logs
from app.auth.security import Principal, require_roles
from app.routes.filters import SeismicFilters, get_filters

router = APIRouter(prefix="/analytics", tags=["Exportaciones"])
JOIN = events.join(sources, events.c.source_id == sources.c.id)
EXPORT_LIMIT = 5000


def csv_safe(value) -> str:
    """Previene fórmulas al abrir el CSV en Excel u otro gestor de hojas."""
    text = "" if value is None else str(value)
    if isinstance(value, str) and text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + text
    return text


@router.get("/export.csv")
def export_events_csv(
    filters: SeismicFilters = Depends(get_filters), engine: Engine = Depends(get_read_engine),
    principal: Principal = Depends(require_roles('administrador','analista','operador_alertas','auditor')),
) -> Response:
    """Exporta resultados filtrados más recientes; indica si fueron truncados."""
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(JOIN).where(*filters.conditions())).scalar_one()
            rows = conn.execute(
                select(events.c.occurred_at, events.c.magnitude, events.c.magnitude_type,
                       events.c.depth_km, events.c.latitude, events.c.longitude, events.c.place,
                       sources.c.name.label("source_name"), events.c.external_id, events.c.source_url)
                .select_from(JOIN).where(*filters.conditions())
                .order_by(events.c.occurred_at.desc(), events.c.id.desc()).limit(EXPORT_LIMIT)
            ).all()
    except SQLAlchemyError:
        raise HTTPException(503, "Exportación temporalmente no disponible") from None
    # Compatibilidad con CSV de fases anteriores: también exigir sesión y auditar.
    try:
        with engine.begin() as conn:
            conn.execute(audit_logs.insert().values(actor_id=principal.id, action='report.legacy_csv.generated',
                entity_type='seismic_events',after_json={'rows':len(rows),
                    'truncated': total > len(rows), 'source':filters.source},result='success'))
    except SQLAlchemyError:
        raise HTTPException(503, 'No se pudo auditar la exportación') from None
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["fecha_utc", "magnitud", "tipo_magnitud", "profundidad_km",
                     "latitud", "longitud", "localidad", "fuente", "id_externo", "url_origen"])
    for row in rows:
        writer.writerow([csv_safe(value) for value in row])
    # BOM ayuda a Excel a interpretar correctamente tildes y eñes en UTF-8.
    return Response(content="\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="eventos_sismicos.csv"',
                             "X-Export-Truncated": str(total > len(rows)).lower(),
                             "X-Export-Total": str(total)})
