/** Preferencias de aviso: el servidor identifica la cuenta desde el JWT. */
import {apiAuthed} from '../auth/api';

export type NotificationPreference = {
  enabled: boolean;
  min_magnitude: number;
  source: string;
  email: string;
  email_usable: boolean;
  activated_at: string | null;
  updated_at: string | null;
};
export type PersonalDelivery = {
  id: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  created_at: string;
  sent_at: string | null;
  error_code: string | null;
  magnitude: number | null;
  place: string | null;
  occurred_at: string;
  source_url: string;
};
export type PersonalHistory = {
  items: PersonalDelivery[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export const getPreference = () => apiAuthed<NotificationPreference>('/api/v1/me/notifications');
export const savePreference = (enabled: boolean, minMagnitude: number) =>
  apiAuthed<NotificationPreference>('/api/v1/me/notifications', {
    method: 'PATCH', body: JSON.stringify({enabled, min_magnitude: minMagnitude}),
  });
export const getHistory = (page: number, pageSize: number) =>
  apiAuthed<PersonalHistory>(`/api/v1/me/notifications/history?page=${page}&page_size=${pageSize}`);
