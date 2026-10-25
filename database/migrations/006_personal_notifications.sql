-- Fase 7: preferencias individuales OPT-IN. No altera datasets, experimentos ni reglas globales.
-- Ejecutar desde Supabase SQL Editor con rol propietario; la API usa su conexión privada.
BEGIN;
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE RESTRICT,
  min_magnitude NUMERIC(4,1) NOT NULL DEFAULT 3.5
    CHECK (min_magnitude BETWEEN 2.0 AND 9.0),
  activated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_activation_chk CHECK
    (NOT enabled OR activated_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.personal_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL REFERENCES public.seismic_events(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_code TEXT,
  CONSTRAINT personal_notification_unique UNIQUE (user_id, event_id)
);
CREATE INDEX IF NOT EXISTS personal_notification_due_idx
  ON public.personal_notification_deliveries(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS personal_notification_history_idx
  ON public.personal_notification_deliveries(user_id, created_at DESC);

-- Denegar acceso directo a usuarios de Auth/anon. Todo pasa por FastAPI y RBAC.
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_preferences FROM anon, authenticated;
REVOKE ALL ON TABLE public.personal_notification_deliveries FROM anon, authenticated;
COMMIT;
