/** Todos los componentes consultan FastAPI; nunca se conecta React a Supabase. */
import { authClient } from '../auth/client';
import type {
  AnalyticsFilters, GeoDataset, MagnitudeDistribution,
  ScatterDataset, Summary, TimeSeries,
} from '../types/analytics';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export function filterQuery(filters: AnalyticsFilters, extra: Record<string, string | number> = {}): string {
  const params = new URLSearchParams();
  Object.entries({ ...filters, ...extra }).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

async function read<T>(endpoint: string, filters: AnalyticsFilters, extra: Record<string, string | number> = {}, signal?: AbortSignal): Promise<T> {
  const params = filterQuery(filters, extra);
  const response = await fetch(`${API_BASE}/api/v1/${endpoint}?${params}`, { signal });
  if (!response.ok) throw new Error(`FastAPI devolvió HTTP ${response.status}`);
  return (await response.json()) as T;
}

export const getSummary = (filters: AnalyticsFilters, signal?: AbortSignal) => read<Summary>('dashboard/summary', filters, {}, signal);
export const getTimeSeries = (filters: AnalyticsFilters, interval: 'day' | 'month', signal?: AbortSignal) => read<TimeSeries>('analytics/timeseries', filters, { interval }, signal);
export const getMagnitudes = (filters: AnalyticsFilters, signal?: AbortSignal) => read<MagnitudeDistribution>('analytics/magnitudes', filters, {}, signal);
export const getScatter = (filters: AnalyticsFilters, signal?: AbortSignal) => read<ScatterDataset>('analytics/depth-vs-magnitude', filters, { limit: 500 }, signal);
export const getMapEvents = (filters: AnalyticsFilters, signal?: AbortSignal) => read<GeoDataset>('events/geojson', filters, { limit: 1000 }, signal);

/** Descarga en el navegador, sin exponer secretos ni codificar datos ficticios. */
export async function downloadEventsCsv(filters: AnalyticsFilters): Promise<void> {
  const {data} = await authClient?.auth.getSession() ?? {data:{session:null}};
  if (!data.session) throw new Error('Inicia sesión para exportar datos');
  const response = await fetch(`${API_BASE}/api/v1/analytics/export.csv?${filterQuery(filters)}`, {
    headers: {Authorization: `Bearer ${data.session.access_token}`}
  });
  if (!response.ok) throw new Error(`Error al exportar CSV (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'eventos_sismicos.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
