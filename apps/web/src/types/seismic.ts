/** Tipos del contrato FastAPI; sin datos generados ni estimaciones. */
export interface SeismicEvent {
  id: string;
  source_id: string;
  source_name: string;
  external_id: string;
  occurred_at: string;
  latitude: number;
  longitude: number;
  magnitude: number | null;
  magnitude_type: string | null;
  depth_km: number | null;
  place: string | null;
  source_url: string;
  source_updated_at: string | null;
  review_status: string;
  received_at: string;
}
export interface EventPage {
  items: SeismicEvent[];
  total: number;
  page: number;
  page_size: number;
}
export interface IngestionRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  records_seen: number;
  records_inserted: number;
  records_updated: number;
  error_summary: string | null;
}
export interface DataSource {
  id: string;
  name: string;
  organization: string;
  base_url: string;
  source_type: string;
  status: string;
  sync_interval_minutes: number | null;
  license_notes: string | null;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_run: IngestionRun | null;
}
