/** Reportes privados de Fase 8; cada descarga usa JWT y no expone tokens en URL. */
import { authClient } from '../auth/client';
import { apiAuthed } from '../auth/api';
const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export type ReportType = 'events' | 'quality' | 'models' | 'sources' | 'alerts';
export type ReportFormat = 'csv' | 'xlsx' | 'pdf';
export type ReportOptions = {types:{id:ReportType;name:string}[];formats:ReportFormat[];disclaimer:string};
export type ReportPayload = {kind:ReportType;format:ReportFormat;name?:string;start_at?:string;
  end_at?:string;source?:string;min_magnitude?:number;south?:number;north?:number;west?:number;east?:number};
export type ReportRecord = {id:string;report_name:string;report_type:ReportType;file_format:ReportFormat;
  requester_id:string;solicitante:string;row_count:number;status:string;cutoff_at:string;created_at:string;
  expires_at:string;content_sha256:string;filters:Record<string,unknown>};
export type ReportHistory = {items:ReportRecord[];total:number;page:number;pages:number;storage_note:string};
export type SystemSettings = {values:Record<string,number>;editable:boolean;note:string};

export const getReportOptions = () => apiAuthed<ReportOptions>('/api/v1/reports/options');
export const getReportHistory = (page:number) => apiAuthed<ReportHistory>(`/api/v1/reports/history?page=${page}&page_size=10`);
export const getSystemSettings = () => apiAuthed<SystemSettings>('/api/v1/admin/system/settings');
export const saveSystemSetting = (key:string,value_int:number) => apiAuthed<{key:string;value_int:number}>(
  '/api/v1/admin/system/settings',{method:'PATCH',body:JSON.stringify({key,value_int})});

async function binaryDownload(path:string, options:RequestInit, fallback:string) {
  if (!authClient) throw new Error('Supabase Auth sin configurar');
  const {data} = await authClient.auth.getSession();
  if (!data.session) throw new Error('Sesión caducada');
  const headers = new Headers(options.headers);
  headers.set('Authorization',`Bearer ${data.session.access_token}`);
  if (options.body) headers.set('Content-Type','application/json');
  const result=await fetch(`${API}${path}`,{...options,headers});
  if (!result.ok) {
    const detail=await result.json().catch(()=>null) as {detail?:string}|null;
    throw new Error(detail?.detail ?? `Error al exportar (HTTP ${result.status})`);
  }
  const match=result.headers.get('Content-Disposition')?.match(/filename="([a-zA-Z0-9_.-]+)"/);
  const name=match?.[1] ?? fallback;
  const url=URL.createObjectURL(await result.blob());
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const downloadReport = (payload:ReportPayload) => binaryDownload('/api/v1/reports/generate',
  {method:'POST',body:JSON.stringify(payload)},`reporte.${payload.format}`);
export const downloadAudit = () => binaryDownload('/api/v1/admin/system/audit/export.csv',
  {method:'GET'},'auditoria.csv');
