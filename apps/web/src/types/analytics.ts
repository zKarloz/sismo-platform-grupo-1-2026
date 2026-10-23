/** Contratos HTTP descriptivos de FastAPI: datos históricos, nunca predicciones. */
export interface AnalyticsFilters {
  start_time?: string;
  end_time?: string;
  min_magnitude?: number;
  max_magnitude?: number;
  min_depth?: number;
  max_depth?: number;
  source?: string;
}

export interface Summary {
  total: number;
  with_magnitude: number;
  with_depth: number;
  max_magnitude: number | null;
  avg_depth_km: number | null;
  latest_event_at: string | null;
}
export interface SeriesPoint { period: string; count: number }
export interface TimeSeries { interval: 'day' | 'month'; timezone: 'UTC'; items: SeriesPoint[]; total: number }
export interface MagnitudeBucket { range: string; count: number }
export interface MagnitudeDistribution { items: MagnitudeBucket[]; total: number }
export interface ScatterPoint { id: string; magnitude: number; depth_km: number; occurred_at: string }
export interface ScatterDataset { items: ScatterPoint[]; total: number; returned: number; truncated: boolean; sample: 'most_recent' }
export interface GeoFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    external_id: string; occurred_at: string;
    magnitude: number | null; magnitude_type: string | null; depth_km: number | null;
    place: string | null; source_url: string; source_name: string;
  };
}
export interface GeoDataset { type: 'FeatureCollection'; features: GeoFeature[]; total: number; returned: number; truncated: boolean; sample: 'most_recent' }
