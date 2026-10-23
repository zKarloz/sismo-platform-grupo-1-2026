/** Consulta GET a la API propia; nunca expone credenciales ni entrena desde React. */
import type { ExperimentList } from '../types/ml';
const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
export async function getExperiments(signal?: AbortSignal): Promise<ExperimentList> {
  const response = await fetch(`${BASE}/api/v1/ml/experiments?page_size=100`, { signal });
  if (!response.ok) throw new Error(`FastAPI devolvió HTTP ${response.status}`);
  return (await response.json()) as ExperimentList;
}
