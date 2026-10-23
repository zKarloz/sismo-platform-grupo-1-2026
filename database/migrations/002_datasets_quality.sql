-- FASE 5: snapshots de datasets versionados e inmutables para ML exploratorio.
-- Ejecutar UNA VEZ en Supabase SQL Editor después de 001_initial_schema.sql.
-- No se almacena ninguna predicción ni se modifica seismic_events.
BEGIN;

CREATE TABLE IF NOT EXISTS public.datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 3 AND 64),
    version INTEGER NOT NULL CHECK (version >= 1),
    query_spec JSONB NOT NULL CHECK (jsonb_typeof(query_spec) = 'object'),
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    row_count INTEGER NOT NULL CHECK (row_count > 0 AND row_count <= 5000),
    quality_report JSONB NOT NULL CHECK (jsonb_typeof(quality_report) = 'object'),
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT datasets_name_version_uq UNIQUE (name, version),
    CONSTRAINT datasets_period_order CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end)
);

-- Cada fila contiene una COPIA de los valores observados al capturar el dataset.
-- No se leen datos de seismic_events para reconstruir el pasado porque USGS
-- puede revisar magnitud/profundidad/ubicación después de sincronizar.
CREATE TABLE IF NOT EXISTS public.dataset_snapshots (
    dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL CHECK (position >= 1 AND position <= 5000),
    event_id UUID NOT NULL REFERENCES public.seismic_events(id) ON DELETE RESTRICT,
    record JSONB NOT NULL CHECK (jsonb_typeof(record) = 'object'),
    PRIMARY KEY (dataset_id, position),
    CONSTRAINT dataset_snapshots_dataset_event_uq UNIQUE (dataset_id, event_id)
);
CREATE INDEX IF NOT EXISTS dataset_snapshots_event_idx ON public.dataset_snapshots(event_id);
CREATE INDEX IF NOT EXISTS datasets_created_idx ON public.datasets(created_at DESC);

-- Las posiciones permitidas son 1..row_count. Tras insertar todas las filas,
-- la PK impide insertar nuevas posiciones y el trigger impide exceder row_count.
-- Combinado con la prohibición de UPDATE/DELETE, congela el contenido.
CREATE OR REPLACE FUNCTION public.limit_dataset_snapshot_position()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE permitted_rows INTEGER;
BEGIN
    SELECT row_count INTO permitted_rows FROM public.datasets WHERE id = NEW.dataset_id;
    IF permitted_rows IS NULL OR NEW.position > permitted_rows THEN
        RAISE EXCEPTION 'Posición fuera del rango declarado del dataset';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dataset_snapshots_limit_position ON public.dataset_snapshots;
CREATE TRIGGER dataset_snapshots_limit_position BEFORE INSERT ON public.dataset_snapshots
FOR EACH ROW EXECUTE FUNCTION public.limit_dataset_snapshot_position();

-- La persistencia de versiones es append-only; un cambio exige crear nueva versión.
CREATE OR REPLACE FUNCTION public.reject_dataset_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Dataset inmutable: genere una nueva version en vez de modificar o borrar filas';
END;
$$;
DROP TRIGGER IF EXISTS datasets_immutable ON public.datasets;
CREATE TRIGGER datasets_immutable BEFORE UPDATE OR DELETE ON public.datasets
FOR EACH ROW EXECUTE FUNCTION public.reject_dataset_mutation();
DROP TRIGGER IF EXISTS dataset_snapshots_immutable ON public.dataset_snapshots;
CREATE TRIGGER dataset_snapshots_immutable BEFORE UPDATE OR DELETE ON public.dataset_snapshots
FOR EACH ROW EXECUTE FUNCTION public.reject_dataset_mutation();

-- El navegador solo consume la API propia FastAPI, no Supabase Data API.
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.datasets, public.dataset_snapshots FROM anon, authenticated;
COMMIT;
