-- Verificación de estructura, sin modificar registros.
SELECT c.relname AS tabla, c.relrowsecurity AS rls_activo,
       COUNT(t.oid) AS triggers_habilitados
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal AND t.tgenabled <> 'D'
WHERE n.nspname='public' AND c.relname='ml_experiments'
GROUP BY c.oid,c.relname,c.relrowsecurity;

-- Conteos globales y últimos experimentos (vacío hasta ejecutar el laboratorio).
SELECT d.name, d.version, e.task_type, e.algorithm, e.created_at,
       e.metrics ->> 'accuracy' AS accuracy,
       e.metrics ->> 'macro_f1' AS macro_f1,
       e.metrics ->> 'mae' AS mae
FROM public.ml_experiments e
JOIN public.datasets d ON d.id=e.dataset_id
ORDER BY e.created_at DESC LIMIT 15;
