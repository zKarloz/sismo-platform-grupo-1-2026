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
  experimentId?: string; // Solo detalles de Estimaciones, filtrados en FastAPI.
}

/** Valores observados y estimados por fila física del Excel IGP, solo 2024. */
export interface ValidationPrediction {
  source_row: number;
  occurred_at: string;
  actual_value: number | string;
  predicted_value: number | string;
}
export interface PredictionList {
  experiment_id: string;
  total: number;
  page: number;
  page_size: number;
  split: 'validation';
  year: 2024;
  items: ValidationPrediction[];
}


/** Valores de validación ya observados. NO son pronósticos ni publicaciones. */
export interface RetrospectiveEstimate {
  experiment_id: string;
  batch_id: string;
  dataset_name: string;
  dataset_version: number;
  algorithm: string;
  model_version: string;
  task_type: 'regression' | 'classification';
  target_name: string;
  source_row: number;
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  actual_value: string | number;
  predicted_value: string | number;
  absolute_error: number | null;
  correct_classification: boolean | null;
  probability: null;
  prediction_interval: null;
  uncertainty_note: string;
  experiment_registered_at: string | null;
  calculated_at: null;
  review_status: 'not_reviewed';
  published: false;
  limitations: string;
  warning: string;
}
export interface EstimateList {
  items: RetrospectiveEstimate[];
  total: number;
  page: number;
  page_size: number;
  year: 2024;
  split: 'validation';
  review_status: 'not_reviewed';
  disclaimer: string;
}

/** Resumen agregado en FastAPI sobre todas las filas IGP 2024 válidas. */
export interface EstimateSummaryModel {
  experiment_id: string;
  batch_id: string;
  algorithm: string;
  model_version: string;
  task_type: 'regression' | 'classification';
  target_name: string;
  total: number;
  primary_metric: 'mae' | 'macro_f1';
  primary_value: number | null;
}
export interface EstimateSummary {
  total_estimates: number;
  unique_events: number;
  total_models: number;
  models: EstimateSummaryModel[];
  year: 2024;
  split: 'validation';
  note: string;
}

/** Resumen persistido de prueba final 2025; sin predicciones operativas. */
export interface FinalEvaluationReport {
  batch_id: string;
  dataset_id: string;
  year: 2025;
  test_count: number;
  development_count: number;
  evaluated_at: string;
  method: string;
  sha256: string;
  // Métricas reales persistidas. En 2025 no hay pares observado/estimado individuales.
  models: { experiment_id: string; algorithm: string; metrics: Experiment['metrics']; }[];
}
export interface FinalEvaluationList {
  items: FinalEvaluationReport[];
  total: number;
  disclaimer: string;
}
