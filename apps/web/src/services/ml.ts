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

/** Lectura acotada de los 556 pares, sin calcular ni simular nuevas predicciones. */
export async function getValidationPredictions(experimentId: string, signal?: AbortSignal): Promise<import('../types/ml').PredictionList> {
  const response = await fetch(`${BASE}/api/v1/ml/experiments/${encodeURIComponent(experimentId)}/predictions?page_size=1000`, { signal });
  if (!response.ok) throw new Error(`FastAPI devolvió HTTP ${response.status}`);
  return (await response.json()) as import('../types/ml').PredictionList;
}


/** Estimaciones retrospectivas paginadas; API GET, sin escritura ni aprobaciones. */
/** Resumen completo calculado en el servidor con la misma política IGP que el detalle. */
export async function getRetrospectiveEstimateSummary(
  signal?: AbortSignal, filters: import('../types/ml').ExperimentFilters = {},
): Promise<import('../types/ml').EstimateSummary> {
  const params = new URLSearchParams();
  if (filters.datasetId) params.set('dataset_id', filters.datasetId);
  if (filters.batchId) params.set('batch_id', filters.batchId);
  if (filters.taskType) params.set('task_type', filters.taskType);
  const response = await fetch(`${BASE}/api/v1/ml/estimates/summary?${params}`, { signal });
  if (!response.ok) throw new Error(`FastAPI devolvió HTTP ${response.status}`);
  return (await response.json()) as import('../types/ml').EstimateSummary;
}

export async function getRetrospectiveEstimates(
  signal?: AbortSignal, filters: import('../types/ml').ExperimentFilters = {},
): Promise<import('../types/ml').EstimateList> {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1), page_size: String(filters.pageSize ?? 5),
  });
  if (filters.datasetId) params.set('dataset_id', filters.datasetId);
  if (filters.batchId) params.set('batch_id', filters.batchId);
  if (filters.taskType) params.set('task_type', filters.taskType);
  if (filters.experimentId) params.set('experiment_id', filters.experimentId);
  const response = await fetch(`${BASE}/api/v1/ml/estimates?${params}`, { signal });
  if (!response.ok) throw new Error(`FastAPI devolvió HTTP ${response.status}`);
  return (await response.json()) as import('../types/ml').EstimateList;
}

/** La prueba final 2025 nunca se ejecuta desde la interfaz; solo se lee si existe. */
export async function getFinalEvaluations(batchId: string, signal?: AbortSignal): Promise<import('../types/ml').FinalEvaluationList> {
  const params = new URLSearchParams({ batch_id: batchId });
  const response = await fetch(`${BASE}/api/v1/ml/final-evaluations?${params}`, { signal });
  if (!response.ok) throw new Error(`FastAPI devolvió HTTP ${response.status}`);
  return (await response.json()) as import('../types/ml').FinalEvaluationList;
}
