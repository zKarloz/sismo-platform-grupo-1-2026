-- SISTEMA DE MONITOREO SISMICO V2
-- Verificacion NO destructiva: comprueba tablas, RLS y escritura relacional.
-- Copiar a Supabase > SQL Editor DESPUES de la migracion 001.
-- Cualquier dato creado para la prueba se revierte al finalizar.

-- 1. Deben mostrarse exactamente las siete tablas iniciales.
SELECT table_name, 'OK' AS found
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'data_sources', 'ingestion_runs', 'seismic_events',
    'alert_rules', 'alerts', 'audit_logs'
  )
ORDER BY table_name;

-- 2. Todas deben indicar rls_enabled = true.
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
    'users', 'data_sources', 'ingestion_runs', 'seismic_events',
    'alert_rules', 'alerts', 'audit_logs'
  )
ORDER BY relname;

-- 3. Prueba real de insercion, vinculacion y deshacer.
BEGIN;
DO $$
DECLARE
    v_source UUID;
    v_event UUID;
    v_rule UUID;
    v_alert UUID;
BEGIN
    INSERT INTO public.data_sources (name, organization, base_url, source_type)
    VALUES ('__smoke_test_source__', 'Prueba temporal',
            'https://example.org/no-real-source', 'other')
    RETURNING id INTO v_source;

    INSERT INTO public.seismic_events (
        source_id, external_id, occurred_at, latitude, longitude,
        magnitude, magnitude_type, depth_km, place, source_url
    ) VALUES (
        v_source, '__smoke_test_event__', now(), -12.05, -77.05,
        4.5, 'Mw', 30, 'Registro temporal para prueba',
        'https://example.org/no-real-event'
    ) RETURNING id INTO v_event;

    INSERT INTO public.ingestion_runs (
        source_id, status, records_seen, records_inserted, finished_at
    ) VALUES (v_source, 'success', 1, 1, now());

    INSERT INTO public.alert_rules (name, min_magnitude, zone_spec)
    VALUES ('__smoke_test_rule__', 4.0, '{"type":"test"}'::jsonb)
    RETURNING id INTO v_rule;

    INSERT INTO public.alerts (
        event_id, rule_id, title, message, source_url
    ) VALUES (
        v_event, v_rule, 'Alerta de prueba temporal',
        'No se notificara a nadie', 'https://example.org/no-real-event'
    ) RETURNING id INTO v_alert;

    IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE id = v_alert AND status = 'pending') THEN
        RAISE EXCEPTION 'La alerta de prueba no se pudo verificar';
    END IF;

    RAISE NOTICE 'OK: insercion en tablas y relaciones validada; la transaccion se revertira.';
END
$$;
ROLLBACK;

-- 4. Debe devolver 0: confirma que la prueba no dejo registros.
SELECT count(*) AS test_rows_remaining
FROM public.data_sources
WHERE name = '__smoke_test_source__';
