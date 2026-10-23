/** Cliente de solo lectura: ninguna credencial de Supabase llega a React. */
import { filterQuery } from './analytics';
import type { AnalyticsFilters } from '../types/analytics';
import type { DatasetList, QualityReport } from '../types/quality';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}/api/v1/${path}`, { signal });
  if (!response.ok) throw new Error(`FastAPI devolvió HTTP ${response.status}`);
  return (await response.json()) as T;
}

export const getQuality = (filters: AnalyticsFilters, signal?: AbortSignal) =>
  request<QualityReport>(`data-quality/summary?${filterQuery(filters)}`, signal);
export const getDatasets = (signal?: AbortSignal) => request<DatasetList>('datasets?page_size=50', signal);
