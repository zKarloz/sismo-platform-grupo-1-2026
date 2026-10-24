-- FASE 7 · Comprobación de migración 004 y trazabilidad (solo lectura).
-- Ejecuta cada SELECT individualmente si Supabase muestra solo la última tabla.

-- A. RLS (todas deben devolver true).
SELECT relname AS tabla, relrowsecurity AS rls_activo
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('alert_rules','alerts','alert_deliveries','audit_logs')
ORDER BY relname;

-- B. Reglas vigentes y origen permitido.
SELECT r.name, r.enabled, s.name AS fuente, r.channel,
       r.requires_approval, r.min_magnitude, r.activated_at
FROM public.alert_rules r
LEFT JOIN public.data_sources s ON s.id = r.source_id
ORDER BY r.created_at DESC LIMIT 10;

-- C. Totales del centro de alertas por estado.
SELECT status, count(*) AS avisos
FROM public.alerts
GROUP BY status ORDER BY status;

-- D. Entregas reales o pendientes, sin revelar destinatarios.
SELECT channel, status, COUNT(*) AS entregas, SUM(attempts) AS intentos
FROM public.alert_deliveries
GROUP BY channel, status ORDER BY channel, status;

-- E. Auditoría de operaciones de alertas.
SELECT action, entity_type, occurred_at
FROM public.audit_logs
WHERE action LIKE 'alert.%'
ORDER BY occurred_at DESC LIMIT 20;
