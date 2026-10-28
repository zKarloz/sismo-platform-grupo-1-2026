/** Datos reales del laboratorio IGP (sismos observados, nunca pronósticos). */
export interface Experiment {
  id: string;
  batch_id: string;
  dataset_id: string;
  dataset_name: string;
  dataset_version: number;
  task_type: 'classification' | 'regression';
  algorithm: string;
  target_name: string;
  model_version: string;
  features: string[];
  params: Record<string, unknown>;
  metrics: {
    accuracy?: number;
    macro_f1?: number;
    mae?: number;
    rmse?: number;
    r2?: number | null;
    confusion_matrix?: number[][];
    labels?: string[];
    per_class?: Record<string, { precision?: number; recall?: number; 'f1-score'?: number } | number>;
    real_vs_estimated?: { date: string; real: number; estimated: number }[];
    units?: string;
  };
  validation_spec: {
    method?: string;
    train_count: number;
    validation_count?: number;
    test_count?: number; // Solo experimentos antiguos.
    train_start: string;
    train_end: string;
    validation_start?: string;
    validation_end?: string;
    test_start?: string;
    test_end?: string;
    test_2025_reserved?: boolean;
    knn_note?: string;
    sklearn_version: string;
    source?: string;
    point_in_time_features_validated: boolean;
  };
  dataset_sha256: string;
  seed: number;
  limitations: string;
  created_at: string;
}
export interface ExperimentList {
  items: Experiment[];
  total: number;
  page: number;
  page_size: number;
  disclaimer: string;
}
export interface ExperimentFilters {
  page?: number;
  pageSize?: number;
  datasetId?: string;
  batchId?: string;
  taskType?: 'classification' | 'regression' | '';
}
