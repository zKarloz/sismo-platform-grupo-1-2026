import { apiAuthed } from '../auth/api';
/** Cliente IGP de calidad y snapshots: únicamente API propia, jamás Supabase desde React. */
import { filterQuery } from './analytics';
import type { AnalyticsFilters } from '../types/analytics';
import type { DatasetIntegrity, DatasetList, DatasetPreview, DatasetMetadata, DatasetReviewResponse, QualityReport } from '../types/quality';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}/api/v1/${path}`, { signal });
  if (!response.ok) throw new Error(`FastAPI devolvió HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** La restricción IGP es obligatoria también en FastAPI, no solo en este cliente. */
export const getQuality = (filters: AnalyticsFilters, signal?: AbortSignal) =>
  request<QualityReport>(`data-quality/summary?${filterQuery({ ...filters, source: 'IGP/CENSIS' })}`, signal);

export const getDatasets = (page = 1, pageSize = 5, signal?: AbortSignal) =>
  request<DatasetList>(`datasets?page=${page}&page_size=${pageSize}`, signal);

export const getDatasetQuality = (id: string, signal?: AbortSignal) =>
  request<DatasetMetadata>(`datasets/${encodeURIComponent(id)}/quality`, signal);

export const getDatasetPreview = (id: string, page = 1, pageSize = 5, signal?: AbortSignal) =>
  request<DatasetPreview>(`datasets/${encodeURIComponent(id)}/preview?page=${page}&page_size=${pageSize}`, signal);

export const getDatasetIntegrity = (id: string, signal?: AbortSignal) =>
  request<DatasetIntegrity>(`datasets/${encodeURIComponent(id)}/integrity`, signal);

/** Solo administradores/analistas autenticados pueden emitir una decisión inmutable. */
export const reviewDataset = (id: string, decision: 'approved' | 'rejected', note: string) =>
  apiAuthed<DatasetReviewResponse>(`/api/v1/datasets/${encodeURIComponent(id)}/review`, {
    method: 'POST', body: JSON.stringify({ decision, note }),
  });
