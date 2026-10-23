/** Cliente HTTP simple. No incorpora datos sísmicos de prueba. */
import type { ApiHealth } from '../types/health';

const API_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function getApiHealth(signal?: AbortSignal): Promise<ApiHealth> {
  const response = await fetch(`${API_URL}/api/v1/health`, { signal });
  if (!response.ok) throw new Error('API no disponible');
  return (await response.json()) as ApiHealth;
}
