/** Cliente HTTP de los endpoints de solo lectura de FastAPI. */
import type { DataSource, EventPage } from '../types/seismic';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

async function readJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  if (!response.ok) throw new Error(`Error de la API (${response.status})`);
  return (await response.json()) as T;
}

export type EventFilters = { page?: number; page_size?: number; min_magnitude?: number; start_time?: string; end_time?: string; source?: string };

export function getEvents(filters: EventFilters = {}, signal?: AbortSignal): Promise<EventPage> {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return readJSON<EventPage>(`/api/v1/events${query.size ? `?${query}` : ''}`, signal);
}

export function getSources(signal?: AbortSignal): Promise<{items: DataSource[]}> {
  return readJSON<{items: DataSource[]}>('/api/v1/sources', signal);
}
