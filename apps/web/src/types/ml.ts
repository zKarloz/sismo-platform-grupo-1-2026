/** Contrato de las métricas históricas: ninguna predicción futura. */
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
    per_class?: Record<string, unknown>;
  };
  validation_spec: {
    train_count: number;
    test_count: number;
    train_start: string;
    train_end: string;
    test_start: string;
    test_end: string;
    class_counts_train: Record<string, number>;
    class_counts_test: Record<string, number>;
    warnings: string[];
    sklearn_version: string;
    point_in_time_features_validated: boolean;
  };
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
