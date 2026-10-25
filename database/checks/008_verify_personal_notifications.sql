-- Verificación de tablas RLS y contadores. Nunca expone emails ni contraseñas.
SELECT tablename, rowsecurity AS rls_activo
FROM pg_tables WHERE schemaname='public'
AND tablename IN ('notification_preferences','personal_notification_deliveries')
ORDER BY tablename;
SELECT enabled, count(*) AS preferencias
FROM public.notification_preferences GROUP BY enabled;
SELECT status, count(*) AS envios FROM public.personal_notification_deliveries GROUP BY status;
