-- Fase 6. Ejecutar después de 002_datasets_quality.sql en Supabase SQL Editor.
-- Solo experimentos RETROSPECTIVOS sobre sismos reportados; no predicciones ni alertas.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ml_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL,              -- Une baseline, clasificador y regresiones
    task_type TEXT NOT NULL CHECK (task_type IN ('classification', 'regression')),
    algorithm TEXT NOT NULL CHECK (length(algorithm) BETWEEN 3 AND 100),
    target_name TEXT NOT NULL CHECK (target_name IN ('magnitude_range_observed', 'magnitude_observed')),
    model_version TEXT NOT NULL,
    features JSONB NOT NULL CHECK (jsonb_typeof(features) = 'array'),
    params JSONB NOT NULL CHECK (jsonb_typeof(params) = 'object'),
    metrics JSONB NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
    validation_spec JSONB NOT NULL CHECK (jsonb_typeof(validation_spec) = 'object'),
    dataset_sha256 TEXT NOT NULL CHECK (dataset_sha256 ~ '^[0-9a-f]{64}$'),
    seed INTEGER NOT NULL,
    limitations TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'invalidated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ml_experiments_task_target CHECK (
        (task_type='classification' AND target_name='magnitude_range_observed') OR
        (task_type='regression' AND target_name='magnitude_observed')
    )
);
CREATE INDEX IF NOT EXISTS ml_experiments_created_idx ON public.ml_experiments(created_at DESC);
CREATE INDEX IF NOT EXISTS ml_experiments_dataset_idx ON public.ml_experiments(dataset_id);
CREATE INDEX IF NOT EXISTS ml_experiments_batch_idx ON public.ml_experiments(batch_id);

-- Append-only: cada experimento queda registrado y no se reescriben sus métricas.
CREATE OR REPLACE FUNCTION public.reject_ml_experiment_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Experimento inmutable: realice una nueva ejecución';
END;
$$;
DROP TRIGGER IF EXISTS ml_experiments_immutable ON public.ml_experiments;
CREATE TRIGGER ml_experiments_immutable
BEFORE UPDATE OR DELETE ON public.ml_experiments
FOR EACH ROW EXECUTE FUNCTION public.reject_ml_experiment_mutation();
ALTER TABLE public.ml_experiments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ml_experiments FROM anon, authenticated;
COMMIT;
