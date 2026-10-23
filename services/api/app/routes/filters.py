"""Filtros comunes para todos los indicadores de la Fase 4.

Se aplican directamente en SQL para evitar discrepancias entre KPI, mapa y gráficos.
Todos los rangos de fecha representan instantes UTC y son inclusivos.
"""

from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, Query
from sqlalchemy import func

from app.db.tables import events, sources


@dataclass(frozen=True)
class SeismicFilters:
    start_time: datetime | None = None
    end_time: datetime | None = None
    min_magnitude: float | None = None
    max_magnitude: float | None = None
    min_depth: float | None = None
    max_depth: float | None = None
    source: str | None = None

    def conditions(self) -> list:
        """Devuelve condiciones de SQLAlchemy para un JOIN eventos-fuentes."""
        conditions = []
        for field, comparison in (
            (self.start_time, events.c.occurred_at >= self.start_time if self.start_time else None),
            (self.end_time, events.c.occurred_at <= self.end_time if self.end_time else None),
            (self.min_magnitude, events.c.magnitude >= self.min_magnitude if self.min_magnitude is not None else None),
            (self.max_magnitude, events.c.magnitude <= self.max_magnitude if self.max_magnitude is not None else None),
            (self.min_depth, events.c.depth_km >= self.min_depth if self.min_depth is not None else None),
            (self.max_depth, events.c.depth_km <= self.max_depth if self.max_depth is not None else None),
        ):
            if field is not None:
                conditions.append(comparison)
        if self.source:
            conditions.append(func.lower(sources.c.name) == self.source.lower())
        return conditions


def get_filters(
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    min_magnitude: float | None = Query(None, ge=-3, le=12),
    max_magnitude: float | None = Query(None, ge=-3, le=12),
    min_depth: float | None = Query(None, ge=-20, le=1000),
    max_depth: float | None = Query(None, ge=-20, le=1000),
    source: str | None = Query(None, max_length=40),
) -> SeismicFilters:
    """Valida límites y fechas; errores del usuario devuelven HTTP 422."""
    for value in (start_time, end_time):
        if value is not None and value.tzinfo is None:
            raise HTTPException(422, "Las fechas requieren zona horaria UTC u offset")
    if start_time and end_time and start_time > end_time:
        raise HTTPException(422, "La fecha inicial debe ser anterior a la final")
    if min_magnitude is not None and max_magnitude is not None and min_magnitude > max_magnitude:
        raise HTTPException(422, "Rango de magnitud inválido")
    if min_depth is not None and max_depth is not None and min_depth > max_depth:
        raise HTTPException(422, "Rango de profundidad inválido")
    return SeismicFilters(start_time, end_time, min_magnitude, max_magnitude, min_depth, max_depth, source)
