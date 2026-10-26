"""Consulta y exportación autenticada del catálogo instrumental IGP 1960–2025.

Cualquier rol habilitado puede consultar; exportar exige permisos de Fase 8.
No se incorpora este catálogo a ingesta, alertas ni modelos entrenados.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.auth.security import Principal, require_user
from app.db.session import get_read_engine
from app.db.tables import report_exports, audit_logs
from app.igp.history_catalog import (CatalogError, SOURCE_PAGE, CENSIS_PAGE, PUBLISHED_DATE,
                                      get_catalog, select_events)
from app.reports.service import render_file, checksum
from app.routes.reports import current_settings

router = APIRouter(prefix='/igp-history', tags=['Catálogo histórico IGP'])


class Filters(BaseModel):
    model_config = ConfigDict(extra='forbid')
    year_from: int = Field(default=2020,ge=1960,le=2025)
    year_to: int = Field(default=2025,ge=1960,le=2025)
    min_magnitude: float | None = Field(default=None,ge=0,le=10)
    max_depth: float | None = Field(default=None,ge=0,le=900)
    south: float | None = Field(default=None,ge=-90,le=90)
    west: float | None = Field(default=None,ge=-180,le=180)
    north: float | None = Field(default=None,ge=-90,le=90)
    east: float | None = Field(default=None,ge=-180,le=180)

    @model_validator(mode='after')
    def validate_range(self):
        if self.year_from > self.year_to:
            raise ValueError('Años invertidos')
        area = (self.south,self.west,self.north,self.east)
        if any(value is not None for value in area):
            if any(value is None for value in area) or self.south > self.north or self.west > self.east:
                raise ValueError('Zona rectangular incompleta o invertida')
        return self


class ExportRequest(Filters):
    format: Literal['csv','xlsx','pdf']
    name: str = Field(default='',max_length=100)


def catalog_or_503():
    try:
        return get_catalog()
    except CatalogError:
        raise HTTPException(503,'Catálogo histórico oficial no disponible; reintenta después') from None


def source_info(catalog) -> dict:
    """Informar el origen real de cada versión, sin inventar publicación o ID."""
    is_xlsx = catalog.source_mode == 'censis_xlsx_snapshot'
    is_csv = catalog.source_mode == 'official_csv_snapshot'
    local = is_xlsx or is_csv
    resource = CENSIS_PAGE if is_xlsx else SOURCE_PAGE
    return {
        'name': ('IGP/CENSIS · Histórico instrumental 1960–2025' if is_xlsx
                 else 'IGP · Catálogo instrumental 1960–2025'),
        'resource_url': resource,
        'published_at': None if is_xlsx else PUBLISHED_DATE,
        'retrieved_at': catalog.retrieved_at.isoformat(),
        'snapshot_sha256': catalog.sha256,
        'stale': catalog.stale,
        'source_rows': catalog.total_source,
        'invalid_rows': catalog.skipped,
        'storage': ('Snapshot oficial XLSX de CENSIS leído por FastAPI; no Supabase' if is_xlsx
                    else 'Snapshot CSV oficial local; no Supabase' if is_csv
                    else 'Caché temporal del servidor; no Supabase'),
        'source_mode': catalog.source_mode,
        'original_csv_sha256': catalog.csv_sha256,
        'original_xlsx_sha256': catalog.xlsx_sha256,
        'warning': ('Copia en caché: el origen no respondió' if catalog.stale
                    else 'XLSX exportado con filtros geográficos, magnitud y profundidad; la fecha de lectura no es fecha de publicación' if is_xlsx
                    else 'Snapshot CSV oficial local: la fecha de lectura no es la fecha de publicación del IGP' if local
                    else 'Cobertura instrumental variable; no comparar décadas como riesgo')
    }


@router.get('/events')
def history_events(year_from: int = Query(2020,ge=1960,le=2025),
                   year_to: int = Query(2025,ge=1960,le=2025),
                   min_magnitude: float | None = Query(None,ge=0,le=10),
                   max_depth: float | None = Query(None,ge=0,le=900),
                   south: float | None = Query(None,ge=-90,le=90),
                   west: float | None = Query(None,ge=-180,le=180),
                   north: float | None = Query(None,ge=-90,le=90),
                   east: float | None = Query(None,ge=-180,le=180),
                   page: int = Query(1,ge=1), page_size: int = Query(20,ge=5,le=50),
                   principal: Principal = Depends(require_user)) -> dict:
    filters=Filters(year_from=year_from,year_to=year_to,min_magnitude=min_magnitude,
                    max_depth=max_depth,south=south,west=west,north=north,east=east)
    catalog = catalog_or_503()
    data = select_events(catalog,**filters.model_dump())
    start=(page-1)*page_size
    return {'items':data[start:start+page_size], 'total':len(data), 'page':page,
            'pages':max(1,(len(data)+page_size-1)//page_size),
            'source':source_info(catalog)}


@router.post('/export')
def history_export(data: ExportRequest,principal: Principal = Depends(require_user),
                   engine: Engine = Depends(get_read_engine)) -> Response:
    # Igual que Fase 8: Solo lectura navega, no descarga volcados masivos.
    if principal.role == 'solo_lectura':
        raise HTTPException(403,'Tu rol no permite exportar informes')
    catalog=catalog_or_503()
    filters=data.model_dump(exclude={'format','name'})
    rows=select_events(catalog,**filters)
    try:
        with engine.begin() as conn:
            settings=current_settings(conn)
            max_rows=min(settings['max_report_rows'],400 if data.format=='pdf' else 5000)
            if not rows:
                raise HTTPException(422,'No hay sismos históricos para esos filtros')
            if len(rows)>max_rows:
                raise HTTPException(413,f'{len(rows)} registros; límite {max_rows}. Reduce periodo o zona.')
            cutoff=datetime.now(timezone.utc)
            resource = CENSIS_PAGE if catalog.source_mode == 'censis_xlsx_snapshot' else SOURCE_PAGE
            note=(f'Fuente: IGP catálogo instrumental 1960–2025 | versión {catalog.sha256} | '
                  f'consultado {catalog.retrieved_at.isoformat()} | recurso oficial: {resource}')
            binary,media=render_file('events',data.format,rows,cutoff,source_note=note)
            identifier=uuid4()
            filename=f'igp_historico_{data.year_from}_{data.year_to}_{str(identifier)[:8]}.{data.format}'
            # report_type=events satisface constraint existente; el subtipo y hash
            # de versión están disponibles en filters, nunca se mezclan con USGS.
            conn.execute(report_exports.insert().values(
                id=identifier,requester_id=principal.id,
                report_name=data.name.strip() or f'IGP instrumental {data.year_from}–{data.year_to}',
                report_type='events',file_format=data.format,
                filters={**filters,'catalog':'IGP histórico 1960–2025',
                         'source_resource':resource,'source_version_sha256':catalog.sha256,
                         'source_mode':catalog.source_mode,
                         'source_retrieved_at':catalog.retrieved_at.isoformat(),
                         'source_stale':catalog.stale},
                cutoff_at=cutoff,status='generated',row_count=len(rows),
                byte_count=len(binary),content_sha256=checksum(binary),filename=filename,
                temp_path=None,expires_at=cutoff+timedelta(days=settings['report_history_days'])))
            conn.execute(audit_logs.insert().values(
                actor_id=principal.id,action='report.igp_history.exported',
                entity_type='report_exports',entity_id=identifier,
                after_json={'format':data.format,'rows':len(rows),'source_sha256':catalog.sha256},
                result='success'))
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise HTTPException(503,'No se pudo auditar la exportación') from None
    return Response(content=binary,media_type=media,headers={
        'Content-Disposition':f'attachment; filename="{filename}"',
        'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',
        'X-Report-SHA256':checksum(binary),'X-Source-SHA256':catalog.sha256})
