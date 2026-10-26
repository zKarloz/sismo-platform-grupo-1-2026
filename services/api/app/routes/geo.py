"""GeoJSON acotado para Leaflet, a partir de eventos almacenados."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_read_engine
from app.db.tables import events, sources
from app.routes.filters import SeismicFilters, get_filters

router = APIRouter(prefix="/events", tags=["Mapa sísmico"])
JOIN = events.join(sources, events.c.source_id == sources.c.id)


@router.get("/geojson")
def geojson(
    limit: int = Query(1000, ge=1, le=2000),
    filters: SeismicFilters = Depends(get_filters),
    engine: Engine = Depends(get_read_engine),
) -> dict:
    """Retorna registros recientes con longitud-latitud (orden GeoJSON).

    Nunca reportar cobertura completa si el límite de puntos se ha alcanzado.
    """
    try:
        with engine.connect() as conn:
            total = conn.execute(select(func.count()).select_from(JOIN).where(*filters.conditions())).scalar_one()
            rows = conn.execute(
                select(events.c.id, events.c.external_id, events.c.occurred_at,
                       events.c.latitude, events.c.longitude, events.c.magnitude,
                       events.c.magnitude_type, events.c.depth_km, events.c.place,
                       events.c.source_url, sources.c.name.label("source_name"))
                .select_from(JOIN).where(*filters.conditions())
                .order_by(events.c.occurred_at.desc(), events.c.id.desc()).limit(limit)
            ).all()
    except SQLAlchemyError:
        raise HTTPException(503, "Mapa temporalmente no disponible") from None
    features = [
        {
            "type": "Feature", "id": str(row.id),
            "geometry": {"type": "Point", "coordinates": [row.longitude, row.latitude]},
            "properties": {"external_id": row.external_id, "occurred_at": row.occurred_at,
                           "magnitude": row.magnitude, "magnitude_type": row.magnitude_type,
                           "depth_km": row.depth_km, "place": row.place,
                           "source_url": row.source_url, "source_name": row.source_name},
        }
        for row in rows
    ]
    return {"type": "FeatureCollection", "features": features, "total": total,
            "returned": len(features), "truncated": total > len(features), "sample": "most_recent"}

# Revisión 03: límites departamentales de INGEMMET para la consulta del mapa.
# Los polígonos son cartografía administrativa referencial, NO zonas de impacto.
import json
from functools import lru_cache
import logging
from app.geo.department_snapshots import boundary_from_snapshot, InvalidDepartmentSnapshot
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

log = logging.getLogger(__name__)

DEPARTAMENTOS_IGP = frozenset({
    'AMAZONAS', 'ANCASH', 'APURIMAC', 'AREQUIPA', 'AYACUCHO', 'CAJAMARCA',
    'CALLAO', 'CUSCO', 'HUANCAVELICA', 'HUANUCO', 'ICA', 'JUNIN',
    'LA LIBERTAD', 'LAMBAYEQUE', 'LIMA', 'LORETO', 'MADRE DE DIOS',
    'MOQUEGUA', 'PASCO', 'PIURA', 'PUNO', 'SAN MARTIN', 'TACNA',
    'TUMBES', 'UCAYALI',
})
INGEMMET_LAYER = (
    'https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/'
    'SERV_CARTOGRAFIA_DEMARCACION_WGS84/MapServer/0'
)


@lru_cache(maxsize=25)
def _department_boundary(code: str) -> dict:
    """Descargar una sola geometría, validada y cacheada durante la vida del proceso.

    No se persisten los polígonos ni se envían coordenadas del usuario al proveedor.
    """
    # Priorizar snapshot versionado. Así INGEMMET caído NO impide buscar por región.
    # Nunca reemplazar el límite real por una caja rectangular.
    try:
        snapshot = boundary_from_snapshot(code)
    except (OSError, InvalidDepartmentSnapshot) as exc:
        log.warning("GeoJSON local inválido: %s", exc)
        raise HTTPException(status_code=503, detail="Cartografía local inválida: vuelve a preparar el snapshot") from exc
    if snapshot is not None:
        return snapshot

    query = urlencode({
        'where': "NM_DEPA='" + code + "'", 'outFields': 'NM_DEPA',
        'returnGeometry': 'true', 'outSR': '4326', 'f': 'geojson',
    })
    request = Request(
        f'{INGEMMET_LAYER}/query?{query}',
        headers={'User-Agent': 'SismoPlatformV2/1.0 (consulta-departamental)'},
    )
    try:
        with urlopen(request, timeout=15) as response:
            content = response.read(8_000_001)
        if len(content) > 8_000_000:
            raise ValueError('Respuesta cartográfica demasiado grande')
        payload = json.loads(content)
        if not isinstance(payload, dict) or payload.get('type') != 'FeatureCollection':
            raise ValueError('Respuesta GeoJSON no reconocida')
        features = payload.get('features')
        if not isinstance(features, list) or not features:
            raise ValueError('Departamento sin geometría publicada')
        geometries = [feature.get('geometry') for feature in features if isinstance(feature, dict)]
        if not geometries or any(not isinstance(g, dict) or g.get('type') not in ('Polygon', 'MultiPolygon') for g in geometries):
            raise ValueError('El proveedor no devolvió polígonos válidos')
        return {'department': code, 'features': features,
                'source': INGEMMET_LAYER, 'scope': 'limites_referenciales'}
    except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        # Sin snapshot, conservar proveedor original y registrar error interno.
        log.warning("No se pudo descargar geometría %s desde INGEMMET: %s", code, exc)
        raise HTTPException(status_code=503, detail='Cartografía departamental temporalmente no disponible') from exc


@router.get('/departments/{department}/boundary')
def department_boundary(department: str) -> dict:
    """GeoJSON de un departamento peruano para recortar epicentros por ubicación."""
    code = department.upper().strip()
    if code not in DEPARTAMENTOS_IGP:
        raise HTTPException(status_code=422, detail='Departamento no reconocido')
    return _department_boundary(code)
