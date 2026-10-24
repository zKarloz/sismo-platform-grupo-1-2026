-- Fase 2: revisión de política RLS, identidades vinculadas y acciones.
SELECT tablename, rowsecurity AS rls_activo FROM pg_tables
 WHERE schemaname='public' AND tablename IN ('users', 'audit_logs');
SELECT role, status, count(*) AS total,
       count(auth_user_id) AS cuentas_vinculadas
 FROM public.users GROUP BY role, status ORDER BY role, status;
SELECT action, result, occurred_at FROM public.audit_logs
 WHERE action LIKE 'identity.%' OR action LIKE 'alert.%'
 ORDER BY occurred_at DESC LIMIT 20;
-- IMPORTANTE: el UUID real de auth.users se obtiene desde Supabase Auth > Users.
-- Nunca enviar el UUID junto con contraseñas o tokens a terceros.
