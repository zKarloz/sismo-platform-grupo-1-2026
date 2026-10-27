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
  event_id: string;
  approved_by_name: string | null;
  delivery: {status: string; attempts: number; last_attempt_at: string | null;
    delivered_at: string | null; acknowledged_at: string | null; error_code: string | null} | null;
};

async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  return apiAuthed<T>(url, {signal});
}

export const getAlertRules = (signal?: AbortSignal) =>
  read<{items: AlertRule[]}>('/api/v1/alert-rules', signal);

export const getAlertHistory = (page: number, pageSize: number, status: string, signal?: AbortSignal) =>
  read<{items: AlertItem[]; total: number; page: number; page_size: number; disclaimer: string}>(
    `/api/v1/alerts?page=${page}&page_size=${pageSize}${status ? `&status=${encodeURIComponent(status)}` : ''}`, signal,
  );

// Control de reglas y aprobación; actor verificado por FastAPI.
export const activateAlertRule = (id: string, enabled: boolean) =>
  apiAuthed<{ok:boolean}>(`/api/v1/admin/alert-rules/${id}/activation?enabled=${enabled}`, {method:'POST'});
export const reviewAlert = (id:string, approve:boolean) =>
  apiAuthed<{ok:boolean}>(`/api/v1/admin/alerts/${id}/review?approve=${approve}`, {method:'POST'});


// Creador autorizado de reglas; nunca transportar claves SMTP junto a la regla.
export type CreateRulePayload = {
  name: string;
  min_magnitude: number;
  source: 'IGP/CENSIS';
  channel: 'in_app' | 'email';
  destination: string | null;
  severity: 'info' | 'review' | 'high';
  requires_approval: boolean;
  max_depth_km: number | null;
  cooldown_seconds: number;
  zone_spec: {min_lat: number; max_lat: number; min_lon: number; max_lon: number};
  start_hour_peru: number | null;
  end_hour_peru: number | null;
  template_title: string;
  template_body: string;
};
export const createAlertRule = (data: CreateRulePayload) =>
  apiAuthed<{rule_id:string;enabled:boolean}>('/api/v1/admin/alert-rules', {
    method:'POST', body:JSON.stringify(data),
  });

// Las credenciales Gmail NO se guardan en el navegador ni en Supabase.
export const getSmtpStatus = () =>
  apiAuthed<{configured:boolean;missing_variables:string[];note:string}>('/api/v1/admin/smtp/status');
export const sendGmailTechnicalTest = (gmail: string, appPassword: string) =>
  apiAuthed<{accepted_by_smtp:boolean;type:string;note:string}>('/api/v1/admin/smtp/gmail-test', {
    method:'POST', body:JSON.stringify({gmail, app_password: appPassword}),
    cache:'no-store',
  });

/** Eventos IGP recientes y prueba de regla: no generan avisos ni envían correo. */
export type SimulationEvent = {
  id: string;
  occurred_at: string;
  magnitude: number | null;
  place: string | null;
};
export type SimulationResult = {
  match: boolean;
  reason: string;
  simulation: boolean;
  disclaimer: string;
};
export const getSimulationEvents = (signal?: AbortSignal) =>
  read<{items: SimulationEvent[]}>('/api/v1/admin/alert-rules/simulation/events', signal);
export const simulateAlertRule = (ruleId: string, eventId: string) =>
  read<SimulationResult>(`/api/v1/admin/alert-rules/${encodeURIComponent(ruleId)}/simulate/${encodeURIComponent(eventId)}`);
