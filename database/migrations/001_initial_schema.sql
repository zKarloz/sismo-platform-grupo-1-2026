-- SISTEMA DE MONITOREO SISMICO V2
-- Migracion 001: siete tablas iniciales para PostgreSQL / Supabase.
-- Alcance: datos propios, eventos sincronizados, alertas basadas en hechos y auditoria.
-- No incluye prediccion de sismos ni emision de alertas oficiales.
-- Ejecutar UNA VEZ desde Supabase > SQL Editor (rol propietario / postgres).
-- En un proyecto nuevo; si ya existen tablas con estos nombres, revisar primero.

BEGIN;

-- 1) Usuarios internos de la aplicacion (NO almacena contrasenas).
-- Una persona tiene un rol principal durante el MVP. La autorizacion se
-- implementara en FastAPI; esta tabla por si sola no autentica usuarios.
CREATE TABLE IF NOT EXISTS public.users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name      TEXT NOT NULL,
    email          TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'solo_lectura'
                   CHECK (role IN ('administrador', 'analista',
                                   'operador_alertas', 'auditor', 'solo_lectura')),
    status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_not_empty CHECK (length(btrim(email)) > 3)
);

-- Evita direcciones repetidas incluso si cambian mayusculas/minusculas.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq
    ON public.users (lower(email));

-- 2) Fuentes externas (USGS, IGP, y otras que se habiliten).
-- Las condiciones reales de licencia y atribucion se documentan por fuente.
CREATE TABLE IF NOT EXISTS public.data_sources (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT NOT NULL UNIQUE,
    organization          TEXT NOT NULL,
    base_url              TEXT NOT NULL,
    source_type           TEXT NOT NULL CHECK (source_type IN ('api', 'csv', 'other')),
    status                TEXT NOT NULL DEFAULT 'planned'
                          CHECK (status IN ('planned', 'active', 'paused', 'error')),
    sync_interval_minutes INTEGER CHECK (sync_interval_minutes IS NULL OR sync_interval_minutes > 0),
    license_notes         TEXT,
    last_sync_at          TIMESTAMPTZ,
    last_success_at       TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Historial operativo de cada sincronizacion.
CREATE TABLE IF NOT EXISTS public.ingestion_runs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id        UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE RESTRICT,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at      TIMESTAMPTZ,
    status           TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'success', 'partial', 'failed')),
    records_seen     INTEGER NOT NULL DEFAULT 0 CHECK (records_seen >= 0),
    records_inserted INTEGER NOT NULL DEFAULT 0 CHECK (records_inserted >= 0),
    records_updated  INTEGER NOT NULL DEFAULT 0 CHECK (records_updated >= 0),
    error_summary    TEXT,
    CONSTRAINT ingestion_runs_time_order
        CHECK (finished_at IS NULL OR finished_at >= started_at),
    CONSTRAINT ingestion_runs_count_limit
        CHECK (records_inserted + records_updated <= records_seen)
);
CREATE INDEX IF NOT EXISTS ingestion_runs_source_started_idx
    ON public.ingestion_runs (source_id, started_at DESC);

-- 4) Solo eventos observados que el sistema haya sincronizado.
-- Nunca guardar registros duplicados del MISMO proveedor; dos proveedores
-- pueden reportar un mismo sismo y se conservan sus procedencias separadas.
CREATE TABLE IF NOT EXISTS public.seismic_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id         UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE RESTRICT,
    external_id       TEXT NOT NULL,
    occurred_at       TIMESTAMPTZ NOT NULL,
    latitude          DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude         DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    magnitude         DOUBLE PRECISION CHECK (magnitude IS NULL OR magnitude BETWEEN -3 AND 12),
    magnitude_type    TEXT,
    depth_km          DOUBLE PRECISION CHECK (depth_km IS NULL OR depth_km BETWEEN -20 AND 1000),
    place             TEXT,
    source_url        TEXT NOT NULL,
    source_updated_at TIMESTAMPTZ,
    review_status     TEXT NOT NULL DEFAULT 'unreviewed'
                      CHECK (review_status IN ('unreviewed', 'reviewed', 'revised')),
    received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT seismic_events_source_external_uq UNIQUE (source_id, external_id),
    CONSTRAINT seismic_events_external_not_empty CHECK (length(btrim(external_id)) > 0),
    CONSTRAINT seismic_events_url_not_empty CHECK (length(btrim(source_url)) > 0)
);
CREATE INDEX IF NOT EXISTS seismic_events_occurred_idx
    ON public.seismic_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS seismic_events_magnitude_time_idx
    ON public.seismic_events (magnitude, occurred_at DESC);
CREATE INDEX IF NOT EXISTS seismic_events_coordinates_idx
    ON public.seismic_events (latitude, longitude);

-- 5) Reglas internas: por defecto DESACTIVADAS y con aprobacion humana.
-- zone_spec se validara en FastAPI (por ejemplo: bbox geografica de Peru).
CREATE TABLE IF NOT EXISTS public.alert_rules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL UNIQUE,
    min_magnitude     NUMERIC(4,1) NOT NULL CHECK (min_magnitude BETWEEN -3 AND 12),
    max_depth_km      NUMERIC(7,2) CHECK (max_depth_km IS NULL OR max_depth_km >= 0),
    zone_spec         JSONB NOT NULL CHECK (jsonb_typeof(zone_spec) = 'object'),
    severity          TEXT NOT NULL DEFAULT 'info'
                      CHECK (severity IN ('info', 'review', 'high')),
    channel           TEXT NOT NULL DEFAULT 'in_app'
                      CHECK (channel IN ('in_app', 'email')),
    cooldown_seconds  INTEGER NOT NULL DEFAULT 1800 CHECK (cooldown_seconds >= 0),
    enabled           BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    created_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) Alertas exclusivamente relacionadas con EVENTOS ya registrados.
-- La severidad es operativa/interna, NO una escala oficial de peligro.
CREATE TABLE IF NOT EXISTS public.alerts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id       UUID NOT NULL REFERENCES public.seismic_events(id) ON DELETE RESTRICT,
    rule_id        UUID NOT NULL REFERENCES public.alert_rules(id) ON DELETE RESTRICT,
    severity       TEXT NOT NULL DEFAULT 'info'
                   CHECK (severity IN ('info', 'review', 'high')),
    title          TEXT NOT NULL,
    message        TEXT NOT NULL,
    source_url     TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'sent', 'failed', 'cancelled')),
    disclaimer     TEXT NOT NULL DEFAULT
                   'Aviso informativo basado en un evento registrado; no es una alerta oficial.',
    approved_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT alerts_event_rule_uq UNIQUE (event_id, rule_id),
    CONSTRAINT alerts_approval_consistency
        CHECK (approved_at IS NULL OR approved_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS alerts_status_created_idx
    ON public.alerts (status, created_at DESC);

-- 7) Registro de operaciones y cambios importantes.
-- Aplicacion: solo INSERT; no incluir secretos en before_json/after_json.
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action         TEXT NOT NULL,
    entity_type    TEXT NOT NULL,
    entity_id      UUID,
    before_json    JSONB,
    after_json     JSONB,
    result         TEXT NOT NULL DEFAULT 'success'
                   CHECK (result IN ('success', 'failure')),
    correlation_id UUID,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_occurred_idx
    ON public.audit_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
    ON public.audit_logs (entity_type, entity_id, occurred_at DESC);

-- Seguridad: RLS sin politicas => anon/authenticated no acceden a filas.
-- Aunque 'Enable automatic RLS' este activado, se establece explicitamente.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seismic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- No concedemos acceso directo desde clientes Supabase a estas tablas.
-- La API Python se conecta por PostgreSQL mediante credenciales de servidor.
REVOKE ALL ON TABLE
    public.users, public.data_sources, public.ingestion_runs,
    public.seismic_events, public.alert_rules, public.alerts,
    public.audit_logs
FROM anon, authenticated;

COMMIT;
