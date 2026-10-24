/** Centro de avisos: lectura y operaciones autorizadas con JWT de Supabase Auth. */
import {apiAuthed} from '../auth/api';

export type AlertRule = {
  id: string;
  name: string;
  min_magnitude: number;
  max_depth_km: number | null;
  zone_spec: Record<string, number>;
  severity: 'info' | 'review' | 'high';
  channel: 'in_app' | 'email';
  enabled: boolean;
  requires_approval: boolean;
  cooldown_seconds: number;
  activated_at: string | null;
  source_name: string | null;
};

export type AlertItem = {
  id: string;
  severity: 'info' | 'review' | 'high';
  status: 'pending' | 'approved' | 'sent' | 'failed' | 'cancelled';
  title: string;
  message: string;
  source_url: string;
  created_at: string;
  approved_at: string | null;
  occurred_at: string;
  magnitude: number;
  place: string | null;
  source_name: string;
  rule_name: string;
  channel: string;
  delivery: {status: string; attempts: number; delivered_at: string | null; acknowledged_at: string | null} | null;
};

async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  return apiAuthed<T>(url, {signal});
}

export const getAlertRules = (signal?: AbortSignal) =>
  read<{items: AlertRule[]}>('/api/v1/alert-rules', signal);

export const getAlertHistory = (page: number, status: string, signal?: AbortSignal) =>
  read<{items: AlertItem[]; total: number; page: number; page_size: number; disclaimer: string}>(
    `/api/v1/alerts?page=${page}&page_size=20${status ? `&status=${encodeURIComponent(status)}` : ''}`, signal,
  );

// Control de reglas y aprobación; actor verificado por FastAPI.
export const activateAlertRule = (id: string, enabled: boolean) =>
  apiAuthed<{ok:boolean}>(`/api/v1/admin/alert-rules/${id}/activation?enabled=${enabled}`, {method:'POST'});
export const reviewAlert = (id:string, approve:boolean) =>
  apiAuthed<{ok:boolean}>(`/api/v1/admin/alerts/${id}/review?approve=${approve}`, {method:'POST'});
