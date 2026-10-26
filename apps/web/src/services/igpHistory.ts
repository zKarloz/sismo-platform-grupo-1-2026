/** Catálogo oficial instrumental 1960–2025: consulta autenticada, sin Supabase. */
import { apiAuthed } from '../auth/api';
import { authClient } from '../auth/client';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
export type HistoryFilters = {
  // Ambos extremos son UTC explícito; se usan con precisión de minutos al consultar.
  start_at?: string; end_at?: string;
  year_from?: number; year_to?: number;
  min_magnitude?: number; max_depth?: number;
  south?: number; west?: number; north?: number; east?: number;
};
export type HistoryEvent = {id:string; fecha_utc:string; magnitud:number; profundidad_km:number;
  latitud:number; longitud:number; ubicacion:string|null;fuente:string;id_origen:string;url_origen:string};
export type HistoryProvenance = {name:string; resource_url:string; published_at:string|null;
  retrieved_at:string;snapshot_sha256:string;stale:boolean;source_rows:number;invalid_rows:number;
  storage:string;warning:string;source_mode?:'censis_xlsx_snapshot'|'official_csv_snapshot'|'datastore_api';
  original_csv_sha256?:string|null;original_xlsx_sha256?:string|null};
export type HistoryPage = {items:HistoryEvent[];total:number;page:number;pages:number;source:HistoryProvenance};

export function readHistory(filters:HistoryFilters,page:number,signal?:AbortSignal):Promise<HistoryPage>{
  const params=new URLSearchParams({page:String(page),page_size:'20'});
  Object.entries(filters).forEach(([key,value])=>{
    if(value!==undefined)params.set(key,String(value));
  });
  return apiAuthed<HistoryPage>(`/api/v1/igp-history/events?${params.toString()}`,{signal});
}

export async function exportHistory(filters:HistoryFilters,format:'csv'|'xlsx'|'pdf'){
  if(!authClient)throw new Error('Supabase Auth no está configurado');
  const {data}=await authClient.auth.getSession();
  if(!data.session)throw new Error('Tu sesión ha terminado');
  const response=await fetch(`${API}/api/v1/igp-history/export`,{
    method:'POST',headers:{'Content-Type':'application/json',
      Authorization:`Bearer ${data.session.access_token}`},
    body:JSON.stringify({...filters,format}),
  });
  if(!response.ok){
    const error=await response.json().catch(()=>null) as {detail?:string}|null;
    throw new Error(error?.detail ?? `No se pudo exportar (HTTP ${response.status})`);
  }
  const url=URL.createObjectURL(await response.blob());
  const anchor=document.createElement('a');anchor.href=url;
  const filename=response.headers.get('Content-Disposition')?.match(/filename="([a-zA-Z0-9_.-]+)"/)?.[1];
  anchor.download=filename??`igp_historico.${format}`;
  anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
