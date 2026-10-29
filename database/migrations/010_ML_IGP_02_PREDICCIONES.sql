-- ML IGP, revisión 02: predicciones por fila observada de validación 2024.
-- ADITIVA: no altera las ocho métricas registradas ni seismic_events.
-- Aplicar después de ML_IGP_01_OBJETIVOS.sql e IGP_HISTORICO_DATASETS_01.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ml_validation_predictions (
    experiment_id UUID NOT NULL REFERENCES public.ml_experiments(id) ON DELETE RESTRICT,
    dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE RESTRICT,
    source_row INTEGER NOT NULL CHECK (source_row >= 2),
    occurred_at TIMESTAMPTZ NOT NULL,
    split TEXT NOT NULL DEFAULT 'validation' CHECK (split = 'validation'),
    actual_value JSONB NOT NULL CHECK (jsonb_typeof(actual_value) IN ('number', 'string')),
    predicted_value JSONB NOT NULL CHECK (jsonb_typeof(predicted_value) IN ('number', 'string')),
    PRIMARY KEY (experiment_id, source_row),
    -- No inventar filas de prueba ni asociar sismos a otro dataset.
    CONSTRAINT ml_igp_pred_historical_row_fk FOREIGN KEY (dataset_id, source_row)
        REFERENCES public.igp_historical_dataset_snapshots(dataset_id, source_row) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ml_igp_pred_dataset_idx
    ON public.ml_validation_predictions (dataset_id, occurred_at);

-- Comprobar que el experimento es del mismo snapshot IGP y que el evento es de 2024.
CREATE OR REPLACE FUNCTION public.check_igp_validation_prediction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE exp RECORD; original RECORD;
BEGIN
  SELECT dataset_id, dataset_sha256, validation_spec INTO exp
    FROM public.ml_experiments WHERE id = NEW.experiment_id;
  SELECT split, record INTO original FROM public.igp_historical_dataset_snapshots
    WHERE dataset_id = NEW.dataset_id AND source_row = NEW.source_row;
  IF exp.dataset_id IS DISTINCT FROM NEW.dataset_id OR original.split IS DISTINCT FROM 'validation'
     OR original.record->>'source_name' IS DISTINCT FROM 'IGP/CENSIS'
     OR original.record->>'occurred_at' IS NULL
     OR (original.record->>'occurred_at')::timestamptz IS DISTINCT FROM NEW.occurred_at
     OR NEW.occurred_at < '2024-01-01 00:00:00+00'::timestamptz
     OR NEW.occurred_at >= '2025-01-01 00:00:00+00'::timestamptz
     OR exp.validation_spec->>'test_2025_reserved' IS DISTINCT FROM 'true'
     OR NOT EXISTS (
        SELECT 1 FROM public.datasets d WHERE d.id = NEW.dataset_id
          AND d.content_sha256 = exp.dataset_sha256
          AND d.query_spec->>'source' = 'IGP/CENSIS'
          AND d.query_spec->>'dataset_kind' = 'igp_instrumental_xlsx'
     ) THEN
    RAISE EXCEPTION 'Predicción fuera de la validación IGP 2024 o dataset incompatible';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ml_igp_prediction_valid ON public.ml_validation_predictions;
CREATE TRIGGER ml_igp_prediction_valid BEFORE INSERT
ON public.ml_validation_predictions FOR EACH ROW
EXECUTE FUNCTION public.check_igp_validation_prediction();
DROP TRIGGER IF EXISTS ml_igp_prediction_immutable ON public.ml_validation_predictions;
CREATE TRIGGER ml_igp_prediction_immutable BEFORE UPDATE OR DELETE
ON public.ml_validation_predictions FOR EACH ROW
EXECUTE FUNCTION public.reject_dataset_mutation();

ALTER TABLE public.ml_validation_predictions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ml_validation_predictions FROM anon, authenticated;
COMMIT;
