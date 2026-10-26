"""Fase 8: reportes auditados, configuración RBAC y retención documentada.

Los informes se entregan por HTTPS con sesión válida; no se guardan archivos
públicos ni se devuelve una URL de descarga sin autorización.
"""
from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
from io import StringIO
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.auth.security import Principal, require_user, require_roles
from app.db.session import get_read_engine
from app.db.tables import report_exports, system_settings, audit_logs, users
from app.reports.service import KINDS, query_report, render_file, checksum, csv_cell

router = APIRouter(prefix='/reports', tags=['Reportes auditados'])
admin_router = APIRouter(prefix='/admin/system', tags=['Configuración'])

PERMISSIONS = {
    'administrador': frozenset(KINDS),
    'analista': frozenset(('events','quality','models','sources')),
    'operador_alertas': frozenset(('events','sources','alerts')),
    'auditor': frozenset(KINDS),
    # Solo lectura puede consultar el dashboard; los volcados masivos son otra capacidad.
    'solo_lectura': frozenset(),
}
DEFAULT_SETTINGS = {'max_report_rows':2000, 'report_history_days':90,'audit_retention_days':365}
BOUNDS = {'max_report_rows':(50,5000), 'report_history_days':(7,730),
          'audit_retention_days':(365,3650)}


def current_settings(conn) -> dict[str,int]:
    result = DEFAULT_SETTINGS.copy()
    result.update({key:value for key,value in conn.execute(
        select(system_settings.c.key,system_settings.c.value_int))})
    return result


class ReportInput(BaseModel):
    """JSON controlado: los filtros se normalizan y guardan para trazabilidad."""
    model_config = ConfigDict(extra='forbid')
    kind: Literal['events','quality','models','sources','alerts']
    format: Literal['csv','xlsx','pdf']
    name: str = Field(default='', max_length=100)
    start_at: datetime | None = None
    end_at: datetime | None = None
    source: str | None = Field(default=None,max_length=80)
    min_magnitude: float | None = Field(default=None,ge=-3,le=12)
    south: float | None = Field(default=None,ge=-90,le=90)
    north: float | None = Field(default=None,ge=-90,le=90)
    west: float | None = Field(default=None,ge=-180,le=180)
    east: float | None = Field(default=None,ge=-180,le=180)

    @model_validator(mode='after')
    def validate_scope(self):
        for date in (self.start_at,self.end_at):
            if date and date.tzinfo is None:
                raise ValueError('Las fechas deben incluir zona horaria UTC')
        if self.start_at and self.end_at and self.start_at > self.end_at:
            raise ValueError('Periodo invertido')
        zone = (self.south,self.west,self.north,self.east)
        if any(v is not None for v in zone):
            if not all(v is not None for v in zone) or self.south > self.north or self.west > self.east:
                raise ValueError('La zona debe tener límites sur/oeste/norte/este válidos')
            if self.kind not in ('events','alerts'):
                raise ValueError('Filtro geográfico válido solo para eventos y alertas')
        if self.min_magnitude is not None and self.kind not in ('events','alerts'):
            raise ValueError('Magnitud válida solo para eventos y alertas')
        if self.source and self.kind not in ('events','alerts','sources'):
            raise ValueError('Fuente no aplicable al tipo seleccionado')
        if (self.start_at or self.end_at) and self.kind == 'sources':
            raise ValueError('Fuentes es un inventario actual; no admite periodo temporal')
        return self


@router.get('/options')
def get_options(principal: Principal = Depends(require_user)) -> dict:
    return {'types':[{'id':kind,'name':KINDS[kind]} for kind in KINDS if kind in PERMISSIONS[principal.role]],
            'formats':['csv','xlsx','pdf'],
            'disclaimer':'Sismos ocurridos; sin pronósticos ni alertas tempranas.'}


@router.post('/generate')
def generate_report(data: ReportInput, principal: Principal = Depends(require_user),
                    engine: Engine = Depends(get_read_engine)) -> Response:
    if data.kind not in PERMISSIONS[principal.role]:
        raise HTTPException(403,'Tu rol no puede exportar este tipo de reporte')
    cutoff = datetime.now(timezone.utc)
    bounds = None
    if data.south is not None:
        bounds = (data.south,data.west,data.north,data.east)
    # GET ni una URL con datos privados: archivo siempre como respuesta autenticada.
    filters = data.model_dump(exclude_none=True,exclude={'kind','format','name'},mode='json')
    try:
        with engine.begin() as conn:
            settings = current_settings(conn)
            max_rows = min(settings['max_report_rows'], 400 if data.format=='pdf' else 5000)
            rows = query_report(conn,data.kind,cutoff,data.start_at,data.end_at,
                                data.source,data.min_magnitude,bounds,max_rows)
            if len(rows) > max_rows:
                # Descarga no realizada; dejar error claro sin recortar resultados.
                raise HTTPException(413,f'Más de {max_rows} filas. Reduce el periodo o los filtros.')
            if not rows:
                # Un archivo vacío no es un fallo del PDF: el filtro de consulta no tuvo
                # coincidencias. No guardamos un manifiesto de reporte con 0 filas.
                # Suele ocurrir al alternar entre USGS e IGP o cambiar el período.
                raise HTTPException(422, 'No hay registros para los filtros seleccionados. '
                    'Revisa fuente (IGP/CENSIS o USGS), fechas, magnitud y zona.')
            binary,media = render_file(data.kind,data.format,rows,cutoff)
            report_id=uuid4()
            filename=f'sismo_{data.kind}_{cutoff.strftime("%Y%m%dT%H%M%SZ")}_{str(report_id)[:8]}.{data.format}'
            conn.execute(report_exports.insert().values(
                id=report_id,requester_id=principal.id,report_name=(data.name.strip() or KINDS[data.kind]),
                report_type=data.kind,file_format=data.format,filters=filters,cutoff_at=cutoff,
                status='generated',row_count=len(rows),byte_count=len(binary),
                content_sha256=checksum(binary),filename=filename,temp_path=None,
                expires_at=cutoff+timedelta(days=settings['report_history_days'])))
            conn.execute(audit_logs.insert().values(
                actor_id=principal.id,action='report.export.generated',entity_type='report_exports',
                entity_id=report_id,after_json={'type':data.kind,'format':data.format,'rows':len(rows),
                                                 'sha256':checksum(binary)},result='success'))
    except HTTPException:
        raise
    except (SQLAlchemyError, OSError, ValueError):
        raise HTTPException(503,'No se pudo generar el reporte. Revisa el estado del servicio.') from None
    return Response(content=binary,media_type=media,headers={
        'Content-Disposition':f'attachment; filename="{filename}"',
        'Cache-Control':'no-store, private', 'X-Content-Type-Options':'nosniff',
        'X-Report-Id':str(report_id),'X-Report-SHA256':checksum(binary),
        'X-Report-Cutoff-UTC':cutoff.isoformat(),
    })


@router.get('/history')
def report_history(page: int = Query(1,ge=1), page_size: int = Query(10,ge=5,le=50),
                   principal: Principal = Depends(require_user),
                   engine: Engine = Depends(get_read_engine)) -> dict:
    # Administradores y auditores ven el manifiesto completo, sin los archivos.
    scope = [] if principal.role in ('administrador','auditor') else [report_exports.c.requester_id==principal.id]
    try:
        with engine.connect() as conn:
            total=conn.execute(select(func.count()).select_from(report_exports).where(*scope)).scalar_one()
            results=conn.execute(select(report_exports.c.id,report_exports.c.requester_id,users.c.full_name.label('solicitante'),
                report_exports.c.report_name,report_exports.c.report_type,report_exports.c.file_format,
                report_exports.c.row_count,report_exports.c.status,report_exports.c.cutoff_at,
                report_exports.c.created_at,report_exports.c.expires_at,report_exports.c.content_sha256,
                report_exports.c.filters).join(users,users.c.id==report_exports.c.requester_id).where(*scope)
                .order_by(report_exports.c.created_at.desc(),report_exports.c.id.desc())
                .limit(page_size).offset((page-1)*page_size)).mappings().all()
        return {'items':[dict(v) for v in results], 'total':total,'page':page,
                'pages':max(1,(total+page_size-1)//page_size),'page_size':page_size,
                'storage_note':'Archivos no conservados: descarga directa y manifiesto de auditoría.'}
    except SQLAlchemyError:
        raise HTTPException(503,'Historial de reportes no disponible') from None


@admin_router.get('/settings')
def view_settings(principal: Principal = Depends(require_roles('administrador','auditor')),
                  engine: Engine = Depends(get_read_engine)) -> dict:
    try:
        with engine.connect() as conn:
            return {'values':current_settings(conn),'editable':principal.role=='administrador',
                    'note':'Retención de auditoría documental: no se eliminan bitácoras sin archivo verificado.'}
    except SQLAlchemyError:
        raise HTTPException(503,'Configuración no disponible') from None


class SettingUpdate(BaseModel):
    key: Literal['max_report_rows','report_history_days','audit_retention_days']
    value_int: int


@admin_router.patch('/settings')
def change_setting(data: SettingUpdate, principal: Principal = Depends(require_roles('administrador')),
                   engine: Engine = Depends(get_read_engine)) -> dict:
    low,high=BOUNDS[data.key]
    if not low <= data.value_int <= high:
        raise HTTPException(422,f'Valor fuera de rango ({low}–{high})')
    try:
        with engine.begin() as conn:
            old=current_settings(conn)[data.key]
            conn.execute(update(system_settings).where(system_settings.c.key==data.key).values(
                value_int=data.value_int,updated_by=principal.id,updated_at=datetime.now(timezone.utc)))
            conn.execute(audit_logs.insert().values(actor_id=principal.id,
                action='system.setting.changed',entity_type='system_settings',
                before_json={data.key:old},after_json={data.key:data.value_int},result='success'))
        return {'key':data.key,'value_int':data.value_int}
    except SQLAlchemyError:
        raise HTTPException(503,'No se pudo actualizar la configuración') from None


@admin_router.get('/audit/export.csv')
def audit_export(start_at: datetime | None = None, end_at: datetime | None = None,
                 principal: Principal = Depends(require_roles('administrador','auditor')),
                 engine: Engine = Depends(get_read_engine)) -> Response:
    """CSV auditable de metadatos, sin JSON interno, correos ni secretos."""
    if any(value and value.tzinfo is None for value in (start_at,end_at)):
        raise HTTPException(422,'Fecha con zona horaria obligatoria')
    if start_at and end_at and start_at > end_at:
        raise HTTPException(422,'Periodo invertido')
    cutoff=datetime.now(timezone.utc)
    conditions=[audit_logs.c.occurred_at<=cutoff]
    if start_at: conditions.append(audit_logs.c.occurred_at>=start_at)
    if end_at: conditions.append(audit_logs.c.occurred_at<=end_at)
    try:
        with engine.begin() as conn:
            count=conn.execute(select(func.count()).select_from(audit_logs).where(*conditions)).scalar_one()
            if count > 5000:
                raise HTTPException(413,'Limita el periodo: máximo 5000 entradas por exportación')
            data=conn.execute(select(audit_logs.c.occurred_at, users.c.full_name,
                audit_logs.c.action,audit_logs.c.entity_type,audit_logs.c.result,
                audit_logs.c.correlation_id).select_from(audit_logs.outerjoin(
                users,users.c.id==audit_logs.c.actor_id)).where(*conditions).order_by(
                audit_logs.c.occurred_at.desc(),audit_logs.c.id.desc())).all()
            buff=StringIO(newline='');writer=csv.writer(buff)
            writer.writerow(['fecha_utc','usuario','accion','entidad','resultado','correlacion'])
            for row in data: writer.writerow([csv_cell(item) for item in row])
            output=('\ufeff'+buff.getvalue()).encode('utf-8')
            conn.execute(audit_logs.insert().values(actor_id=principal.id,
                action='audit.export.generated',entity_type='audit_logs',
                after_json={'rows':len(data),'cutoff_utc':cutoff.isoformat()},result='success'))
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise HTTPException(503,'Exportación de auditoría no disponible') from None
    return Response(content=output,media_type='text/csv; charset=utf-8',headers={
        'Content-Disposition':'attachment; filename="auditoria_exportada.csv"',
        'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'})
