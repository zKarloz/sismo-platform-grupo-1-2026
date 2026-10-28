/** API de experimentos IGP: exclusivamente GET, sin acciones de entrenamiento. */
import type { ExperimentFilters, ExperimentList } from '../types/ml';
const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function getExperiments(signal?: AbortSignal, filters: ExperimentFilters = {}): Promise<ExperimentList> {
  const params = new URLSearchParams({ page: String(filters.page ?? 1), page_size: String(filters.pageSize ?? 10) });
  if (filters.datasetId) params.set('dataset_id', filters.datasetId);
  if (filters.batchId) params.set('batch_id', filters.batchId);
  if (filters.taskType) params.set('task_type', filters.taskType);
  const response = await fetch(`${BASE}/api/v1/ml/experiments?${params}`, { signal });
  if (!response.ok) throw new Error(`FastAPI devolvió HTTP ${response.status}`);
  return (await response.json()) as ExperimentList;
}
