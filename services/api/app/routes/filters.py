"""Filtros comunes SQL de eventos observados.

UTC inclusivo y cuadro geográfico opcional (coordenadas WGS84). Nunca se
interpreta un rectángulo como las fronteras administrativas del Perú.
"""

from dataclasses import dataclass
from datetime import datetime
from math import cos, pi, sin

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
    min_lat: float | None = None
    max_lat: float | None = None
    min_lon: float | None = None
    max_lon: float | None = None
    center_lat: float | None = None
    center_lon: float | None = None
    radius_km: float | None = None

    def conditions(self) -> list:
        """Aplicar idéntico recorte a KPI, gráfico, mapa y consultas analíticas."""
        conditions = []
        for value, column, operator in (
            (self.start_time, events.c.occurred_at, 'ge'),
            (self.end_time, events.c.occurred_at, 'le'),
            (self.min_magnitude, events.c.magnitude, 'ge'),
            (self.max_magnitude, events.c.magnitude, 'le'),
            (self.min_depth, events.c.depth_km, 'ge'),
            (self.max_depth, events.c.depth_km, 'le'),
            (self.min_lat, events.c.latitude, 'ge'),
            (self.max_lat, events.c.latitude, 'le'),
            (self.min_lon, events.c.longitude, 'ge'),
            (self.max_lon, events.c.longitude, 'le'),
        ):
            if value is not None:
                conditions.append(column >= value if operator == 'ge' else column <= value)
        if self.radius_km is not None and self.center_lat is not None and self.center_lon is not None:
            # Semiverseno: círculo geodésico aproximado sobre la esfera (WGS84).
            # Evita filtrar solo por rectángulo y conserva recuentos consistentes
            # en KPI, series, reportes geográficos y el mapa.
            radians = pi / 180.0
            d_lat = (events.c.latitude - self.center_lat) * radians / 2
            d_lon = (events.c.longitude - self.center_lon) * radians / 2
            sin_lat = func.sin(d_lat)
            sin_lon = func.sin(d_lon)
            a = (sin_lat * sin_lat + cos(self.center_lat * radians)
                 * func.cos(events.c.latitude * radians) * sin_lon * sin_lon)
            limit = sin(self.radius_km / (2 * 6371.0088)) ** 2
            conditions.append(a <= limit)
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
    min_lat: float | None = Query(None, ge=-90, le=90),
    max_lat: float | None = Query(None, ge=-90, le=90),
    min_lon: float | None = Query(None, ge=-180, le=180),
    max_lon: float | None = Query(None, ge=-180, le=180),
    center_lat: float | None = Query(None, ge=-90, le=90),
    center_lon: float | None = Query(None, ge=-180, le=180),
    radius_km: float | None = Query(None, ge=1, le=2000),
) -> SeismicFilters:
    """Validar fechas, rangos y obligatoriedad del cuadro geográfico completo."""
    for value in (start_time, end_time):
        if value is not None and value.tzinfo is None:
            raise HTTPException(422, 'Las fechas requieren zona horaria UTC u offset')
    if start_time and end_time and start_time > end_time:
        raise HTTPException(422, 'La fecha inicial debe ser anterior a la final')
    if min_magnitude is not None and max_magnitude is not None and min_magnitude > max_magnitude:
        raise HTTPException(422, 'Rango de magnitud inválido')
    if min_depth is not None and max_depth is not None and min_depth > max_depth:
        raise HTTPException(422, 'Rango de profundidad inválido')
    geo = (min_lat, max_lat, min_lon, max_lon)
    if any(value is not None for value in geo):
        if not all(value is not None for value in geo):
            raise HTTPException(422, 'Indica los cuatro límites de la zona')
        if min_lat > max_lat or min_lon > max_lon:
            raise HTTPException(422, 'Límites geográficos inválidos')
    radial = (center_lat, center_lon, radius_km)
    if any(value is not None for value in radial) and not all(value is not None for value in radial):
        raise HTTPException(422, 'El filtro circular requiere latitud, longitud y radio')
    if any(value is not None for value in radial) and any(value is not None for value in geo):
        raise HTTPException(422, 'Selecciona rectángulo o radio; no ambos')
    return SeismicFilters(
        start_time, end_time, min_magnitude, max_magnitude, min_depth,
        max_depth, source, min_lat, max_lat, min_lon, max_lon,
        center_lat, center_lon, radius_km,
    )
