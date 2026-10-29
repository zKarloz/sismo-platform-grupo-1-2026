-- Revisión formal de versiones IGP (append-only): una decisión por dataset.
-- Aplicar tras migraciones 002, IGP_HISTORICO_DATASETS_01 y 005 (usuarios/auditoría).
-- NO modifica datasets, sus snapshots, ml_experiments ni predicciones.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dataset_reviews (
    dataset_id UUID PRIMARY KEY REFERENCES public.datasets(id) ON DELETE RESTRICT,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
    note TEXT NOT NULL CHECK (char_length(btrim(note)) BETWEEN 15 AND 1000),
    reviewed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dataset_sha256 TEXT NOT NULL CHECK (dataset_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS dataset_reviews_by_actor_at_idx
    ON public.dataset_reviews (reviewed_by, reviewed_at DESC);
-- Inmutable incluso si un error de aplicación intenta editar la decisión.
DROP TRIGGER IF EXISTS dataset_reviews_immutable ON public.dataset_reviews;
CREATE TRIGGER dataset_reviews_immutable BEFORE UPDATE OR DELETE
ON public.dataset_reviews FOR EACH ROW EXECUTE FUNCTION public.reject_dataset_mutation();
ALTER TABLE public.dataset_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dataset_reviews FROM anon, authenticated;
COMMIT;
