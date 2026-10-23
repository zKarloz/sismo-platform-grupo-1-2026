-- FASE 5 · Verificación READ ONLY después de ejecutar migración 002.
-- Debe mostrar dos tablas, ambas con RLS, y ambos triggers de inmutabilidad.
-- Antes de crear el primer dataset, las dos tablas estarán vacías.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('datasets', 'dataset_snapshots')
ORDER BY table_name;

SELECT relname AS tabla, relrowsecurity AS rls_activo
FROM pg_class JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE nspname='public' AND relname IN ('datasets','dataset_snapshots')
ORDER BY relname;

SELECT tgrelid::regclass::text AS tabla, tgname AS trigger
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid IN ('public.datasets'::regclass, 'public.dataset_snapshots'::regclass)
ORDER BY tabla;

SELECT
  (SELECT COUNT(*) FROM public.datasets) AS versiones,
  (SELECT COUNT(*) FROM public.dataset_snapshots) AS filas_congeladas;
