-- Fase 8: verificar RLS, configuración, último reporte y conservar snapshots ML.
SELECT tablename, rowsecurity AS rls_activo
FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('report_exports','system_settings','audit_logs')
ORDER BY tablename;
SELECT key,value_int,updated_at FROM public.system_settings ORDER BY key;
SELECT report_type,file_format,status,row_count,cutoff_at,created_at,content_sha256
FROM public.report_exports ORDER BY created_at DESC LIMIT 10;
SELECT 'datasets' AS entidad, COUNT(*) AS total FROM public.datasets
UNION ALL SELECT 'dataset_snapshots',COUNT(*) FROM public.dataset_snapshots
UNION ALL SELECT 'ml_experiments',COUNT(*) FROM public.ml_experiments;
