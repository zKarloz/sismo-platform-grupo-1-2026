/** Peticiones autenticadas: cada acción envía el JWT; el servidor comprueba RBAC. */
import { authClient } from './client';
const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function apiAuthed<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!authClient) throw new Error('Autenticación no configurada');
  const { data } = await authClient.auth.getSession();
  if (!data.session) throw new Error('Sesión vencida. Inicia sesión de nuevo.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API}${path}`, {...options, headers});
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {detail?: string} | null;
    throw new Error(error?.detail ?? `Error HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}
