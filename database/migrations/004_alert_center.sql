-- FASE 7 · ampliar las tablas de la migración 001 sin alterar eventos,
-- snapshots históricos ni experimentos de ML. Ejecutar en Supabase SQL Editor.
-- Las alertas son INFORMATIVAS, no oficiales ni de alerta temprana.
BEGIN;

ALTER TABLE public.alert_rules
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.data_sources(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS destination_ref TEXT,
  ADD COLUMN IF NOT EXISTS template_title TEXT NOT NULL DEFAULT 'Sismo reportado · M {magnitude}',
  ADD COLUMN IF NOT EXISTS template_body TEXT NOT NULL DEFAULT 'IGP/CENSIS reportó un sismo de magnitud {magnitude} en {place} el {occurred_at}. Fuente: {source_url}. Aviso informativo, no oficial.',
  ADD COLUMN IF NOT EXISTS start_hour_peru SMALLINT,
  ADD COLUMN IF NOT EXISTS end_hour_peru SMALLINT,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Para las nuevas reglas: ventana 00–24 (fin exclusivo); ambas horas o ninguna.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='alert_rules_hours_chk') THEN
    ALTER TABLE public.alert_rules ADD CONSTRAINT alert_rules_hours_chk CHECK
      ((start_hour_peru IS NULL AND end_hour_peru IS NULL)
        OR (start_hour_peru BETWEEN 0 AND 23 AND end_hour_peru BETWEEN 1 AND 24
            AND start_hour_peru < end_hour_peru));
  END IF;
END $$;

-- No modificamos reglas preexistentes: sin activated_at no se evaluarán.

CREATE TABLE IF NOT EXISTS public.alert_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id          UUID NOT NULL REFERENCES public.alerts(id) ON DELETE RESTRICT,
  channel           TEXT NOT NULL CHECK (channel IN ('in_app', 'email')),
  destination_ref   TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  last_attempt_at   TIMESTAMPTZ,
  next_attempt_at   TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  acknowledged_at   TIMESTAMPTZ,
  error_code        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT alert_deliveries_unique UNIQUE (alert_id, channel, destination_ref)
);
CREATE INDEX IF NOT EXISTS alert_deliveries_retry_idx
    ON public.alert_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS alerts_rule_created_idx
    ON public.alerts(rule_id, created_at DESC);

ALTER TABLE public.alert_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.alert_deliveries FROM anon, authenticated;

-- Los registros de auditoría se conservan, no publicamos endpoints de edición.
COMMIT;
