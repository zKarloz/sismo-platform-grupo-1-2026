/** Consulta solo geometría administrativa de INGEMMET a través de FastAPI.
 * La API actúa como proxy para no depender de la política CORS de ArcGIS.
 */
import type { DepartmentBoundary } from '../lib/peruDepartments';
import { PERU_DEPARTMENTS } from '../lib/peruDepartments';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
export async function getDepartmentBoundary(code: string, signal?: AbortSignal): Promise<DepartmentBoundary> {
  if (!PERU_DEPARTMENTS.some(([id]) => id === code)) throw new Error('Departamento no reconocido');
  const response = await fetch(`${API_BASE}/api/v1/events/departments/${encodeURIComponent(code)}/boundary`, { signal });
  if (!response.ok) throw new Error(`No fue posible consultar los límites del departamento (HTTP ${response.status})`);
  const data = await response.json() as DepartmentBoundary;
  if (!data.features?.length || data.scope !== 'limites_referenciales') throw new Error('Cartografía departamental incompleta');
  return data;
}
