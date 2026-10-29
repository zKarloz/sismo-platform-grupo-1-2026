/** Contratos descriptivos del informe y copias inmutables IGP/CENSIS. */
export interface QualityReport {
  checked_at: string;
  total: number;
  missing: Record<string, number>;
  duplicates_within_source: number;
  out_of_range_or_invalid: number;
  future_events: number;
  complete_magnitude_depth: number;
  min_occurred_at: string | null;
  max_occurred_at: string | null;
  by_source: Record<string, number>;
  status: 'ok' | 'missing_values' | 'review';
  method: string;
  by_split?: { train?: number; validation?: number };
  essential_fields_missing?: number;
  duplicate_check?: string;
}
export interface DatasetMetadata {
  id: string;
  name: string;
  version: number;
  row_count: number;
  content_sha256: string;
  created_at: string;
  query_spec: Record<string, unknown>;
  quality_report: QualityReport;
  // Una versión sin decisión tiene una revisión pendiente.
  review_decision: 'approved' | 'rejected' | null;
  review_note: string | null;
  reviewed_at: string | null;
  reviewer_name: string | null;
}
export interface DatasetList {
  items: DatasetMetadata[];
  total: number;
  page: number;
  page_size: number;
}
export interface DatasetPreviewRow {
  position: number;
  external_id: string | null;
  occurred_at: string | null;
  magnitude: number | null;
  depth_km: number | null;
  latitude: number | null;
  longitude: number | null;
  place: string | null;
  source_name: string;
  split?: 'train' | 'validation';
}
export interface DatasetPreview {
  items: DatasetPreviewRow[];
  total: number;
  page: number;
  page_size: number;
}
export interface DatasetIntegrity {
  id: string;
  row_count: number;
  row_count_matches: boolean;
  hash_matches: boolean;
  igp_only: boolean;
  verified: boolean;
  sha256: string;
}

export interface DatasetReviewResponse {
  dataset_id: string;
  decision: 'approved' | 'rejected';
  note: string;
  reviewer_name: string;
  reviewed_at: string;
  dataset_sha256: string;
}
