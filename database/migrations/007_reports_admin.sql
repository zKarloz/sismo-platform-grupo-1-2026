-- Fase 8: metadatos reproducibles de exportación y configuración no secreta.
-- NO toca datasets, snapshots, ML, eventos, usuarios ni entregas anteriores.
BEGIN;

CREATE TABLE IF NOT EXISTS public.report_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    report_name TEXT NOT NULL,
    report_type TEXT NOT NULL CHECK (report_type IN ('events','quality','models','sources','alerts')),
    file_format TEXT NOT NULL CHECK (file_format IN ('csv','xlsx','pdf')),
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    cutoff_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL CHECK (status IN ('generated','failed')),
    row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
    byte_count INTEGER NOT NULL DEFAULT 0 CHECK (byte_count >= 0),
    content_sha256 TEXT,
    filename TEXT,
    -- Archivos enviados en la respuesta HTTP; no se persiste ruta ni contenido.
    temp_path TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT report_exports_digest_valid CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS report_exports_requester_created_idx
    ON public.report_exports(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS report_exports_expires_idx ON public.report_exports(expires_at);

CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY CHECK (key IN ('max_report_rows','report_history_days','audit_retention_days')),
    value_int INTEGER NOT NULL CHECK (value_int > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);
INSERT INTO public.system_settings(key,value_int) VALUES
    ('max_report_rows',2000), ('report_history_days',90), ('audit_retention_days',365)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_exports, public.system_settings FROM anon, authenticated;

-- La bitácora no se edita ni borra desde la aplicación, ni siquiera por un rol web.
-- La retención de auditoría es una política documentada: NO borra automáticamente
-- eventos que aún no hayan sido archivados y verificados fuera de la base de datos.
CREATE OR REPLACE FUNCTION public.protect_audit_log_v2()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs es append-only; use archivo verificado y procedimiento de custodia';
END $$;
DROP TRIGGER IF EXISTS protect_audit_log_v2 ON public.audit_logs;
CREATE TRIGGER protect_audit_log_v2
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.protect_audit_log_v2();
COMMIT;
