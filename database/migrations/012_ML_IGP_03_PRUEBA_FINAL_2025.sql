-- 012: Prueba final única 2025 sobre el catálogo IGP/CENSIS histórico.
-- Ejecutar DESPUÉS de la migración 011 de aprobación de datasets.
-- No altera los modelos, la validación 2024, los eventos operativos ni las alertas.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ml_final_batches (
  batch_id UUID PRIMARY KEY,
  dataset_id UUID NOT NULL UNIQUE REFERENCES public.datasets(id) ON DELETE RESTRICT,
  dataset_sha256 TEXT NOT NULL CHECK (dataset_sha256 ~ '^[0-9a-f]{64}$'),
  source_file_sha256 TEXT NOT NULL CHECK (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  holdout_sha256 TEXT NOT NULL CHECK (holdout_sha256 ~ '^[0-9a-f]{64}$'),
  test_count INTEGER NOT NULL CHECK (test_count BETWEEN 1 AND 5000),
  development_count INTEGER NOT NULL CHECK (development_count > 0),
  method TEXT NOT NULL CHECK (method = 'refit_2019_2024_fixed_config_then_one_holdout_2025'),
  limitations TEXT NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ml_final_holdout_rows (
  batch_id UUID NOT NULL REFERENCES public.ml_final_batches(batch_id) ON DELETE RESTRICT,
  source_row INTEGER NOT NULL CHECK (source_row >= 2),
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5000),
  record JSONB NOT NULL,
  PRIMARY KEY (batch_id, source_row),
  CONSTRAINT ml_final_holdout_position_uq UNIQUE (batch_id, position)
);
CREATE TABLE IF NOT EXISTS public.ml_final_evaluations (
  experiment_id UUID PRIMARY KEY REFERENCES public.ml_experiments(id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL REFERENCES public.ml_final_batches(batch_id) ON DELETE RESTRICT,
  algorithm TEXT NOT NULL,
  metrics JSONB NOT NULL,
  CONSTRAINT ml_final_one_algorithm_per_batch UNIQUE (batch_id, algorithm)
);

-- Comprobar de nuevo la aprobación y SHA del conjunto de desarrollo en SQL.
CREATE OR REPLACE FUNCTION public.check_ml_final_batch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.datasets d JOIN public.dataset_reviews r ON r.dataset_id = d.id
    WHERE d.id = NEW.dataset_id AND d.content_sha256 = NEW.dataset_sha256
      AND r.dataset_sha256 = d.content_sha256 AND r.decision = 'approved'
      AND d.query_spec->>'source' = 'IGP/CENSIS'
      AND d.query_spec->>'dataset_kind' = 'igp_instrumental_xlsx'
      AND d.query_spec->>'source_file_sha256' = NEW.source_file_sha256
  ) OR (SELECT count(*) FROM public.ml_experiments e
         WHERE e.batch_id = NEW.batch_id AND e.dataset_id = NEW.dataset_id
           AND e.dataset_sha256 = NEW.dataset_sha256) <> 8 THEN
    RAISE EXCEPTION 'Prueba final requiere aprobación y ocho experimentos IGP coincidentes';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ml_final_batch_valid ON public.ml_final_batches;
CREATE TRIGGER ml_final_batch_valid BEFORE INSERT ON public.ml_final_batches
FOR EACH ROW EXECUTE FUNCTION public.check_ml_final_batch();

-- El conjunto de prueba debe proceder de 2025 y de la misma fuente.
CREATE OR REPLACE FUNCTION public.check_ml_final_holdout()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.record->>'source_name' IS DISTINCT FROM 'IGP/CENSIS'
    OR NEW.record->>'split' IS DISTINCT FROM 'test'
    OR (NEW.record->>'source_row')::integer IS DISTINCT FROM NEW.source_row
    OR (NEW.record->>'occurred_at')::timestamptz < '2025-01-01 00:00:00+00'::timestamptz
    OR (NEW.record->>'occurred_at')::timestamptz >= '2026-01-01 00:00:00+00'::timestamptz
    OR (NEW.record->>'magnitude')::numeric < 4.0 THEN
    RAISE EXCEPTION 'Fila fuera del holdout IGP de 2025';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ml_final_holdout_valid ON public.ml_final_holdout_rows;
CREATE TRIGGER ml_final_holdout_valid BEFORE INSERT ON public.ml_final_holdout_rows
FOR EACH ROW EXECUTE FUNCTION public.check_ml_final_holdout();

-- Impedir asociar métricas a otro experimento o algoritmo.
CREATE OR REPLACE FUNCTION public.check_ml_final_evaluation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ml_experiments e WHERE e.id = NEW.experiment_id
    AND e.batch_id = NEW.batch_id AND e.algorithm = NEW.algorithm) THEN
    RAISE EXCEPTION 'Experimento de prueba final incompatible con la corrida';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ml_final_evaluation_valid ON public.ml_final_evaluations;
CREATE TRIGGER ml_final_evaluation_valid BEFORE INSERT ON public.ml_final_evaluations
FOR EACH ROW EXECUTE FUNCTION public.check_ml_final_evaluation();

-- Auditoría inmutable: no hay actualizaciones ni eliminación de resultados.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ml_final_batches', 'ml_final_holdout_rows', 'ml_final_evaluations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS ml_final_immutable ON public.%I', t);
    EXECUTE format('CREATE TRIGGER ml_final_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_dataset_mutation()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END;
$$;
COMMIT;
