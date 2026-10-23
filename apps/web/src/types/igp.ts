/** Contrato de las dos capas IGP consultadas en FastAPI: datos observados, no alertas. */
export type IGPFeedKind = 'recent' | 'latest';

export interface IGPEvent {
  external_id: string;
  occurred_at: string; // ISO 8601 con zona horaria UTC
  latitude: number;
  longitude: number;
  magnitude: number | null;
  magnitude_type: string | null;
  depth_km: number | null;
  place: string | null;
  source_name: string;
  source_url: string;
}

export interface IGPFeed {
  items: IGPEvent[];
  source: string;
  feed: IGPFeedKind;
  fetched_at: string;
  latest_event_at: string | null;
  latest_age_hours: number | null;
  message: string;
  refresh_interval_seconds: number;
}
