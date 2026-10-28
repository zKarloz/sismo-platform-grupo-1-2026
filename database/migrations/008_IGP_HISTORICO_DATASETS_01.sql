-- Capturas históricas oficiales IGP en datasets ya versionados (migración aditiva).
-- Aplicar en Supabase SQL Editor DESPUÉS de 002_datasets_quality.sql.
-- No altera seismic_events, dataset_snapshots ni experimentos existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.igp_historical_dataset_snapshots (
    dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5000),
    source_row INTEGER NOT NULL CHECK (source_row >= 2),
    split TEXT NOT NULL CHECK (split IN ('train', 'validation')),
    record JSONB NOT NULL CHECK (jsonb_typeof(record) = 'object'),
    PRIMARY KEY (dataset_id, position),
    CONSTRAINT igp_history_dataset_source_row_uq UNIQUE (dataset_id, source_row)
);

CREATE INDEX IF NOT EXISTS igp_historical_dataset_split_idx
ON public.igp_historical_dataset_snapshots(dataset_id, split);

-- Verificar que la posición no supera el total declarado de la captura.
CREATE OR REPLACE FUNCTION public.limit_igp_historical_snapshot_position()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ds RECORD;
BEGIN
    SELECT row_count, query_spec INTO ds FROM public.datasets WHERE id = NEW.dataset_id;
    IF NOT FOUND OR NEW.position > ds.row_count
       OR ds.query_spec->>'dataset_kind' IS DISTINCT FROM 'igp_instrumental_xlsx'
       OR ds.query_spec->>'source' IS DISTINCT FROM 'IGP/CENSIS'
    THEN
        RAISE EXCEPTION 'Snapshot IGP histórico fuera del rango o fuente declarados';
    END IF;
    IF NEW.record->>'source_name' IS DISTINCT FROM 'IGP/CENSIS'
       OR (NEW.record->>'source_row')::integer IS DISTINCT FROM NEW.source_row
       OR NEW.record->>'split' IS DISTINCT FROM NEW.split
       OR (NEW.record->>'occurred_at')::timestamptz < '2019-01-01'::timestamptz
       OR (NEW.record->>'occurred_at')::timestamptz >= '2025-01-01'::timestamptz
    THEN
        RAISE EXCEPTION 'Fila histórica IGP con contenido o partición inconsistente';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS igp_historical_snapshot_limit ON public.igp_historical_dataset_snapshots;
CREATE TRIGGER igp_historical_snapshot_limit BEFORE INSERT
ON public.igp_historical_dataset_snapshots FOR EACH ROW
EXECUTE FUNCTION public.limit_igp_historical_snapshot_position();

-- Reutiliza el mecanismo de inmutabilidad existente de la migración 002.
DROP TRIGGER IF EXISTS igp_historical_snapshot_immutable ON public.igp_historical_dataset_snapshots;
CREATE TRIGGER igp_historical_snapshot_immutable BEFORE UPDATE OR DELETE
ON public.igp_historical_dataset_snapshots FOR EACH ROW
EXECUTE FUNCTION public.reject_dataset_mutation();

ALTER TABLE public.igp_historical_dataset_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.igp_historical_dataset_snapshots FROM anon, authenticated;
COMMIT;
