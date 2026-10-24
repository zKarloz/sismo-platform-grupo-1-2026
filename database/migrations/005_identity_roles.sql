-- Fase 2: identidad externa verificada + permisos. No toca datasets ni ML.
-- Ejecutar desde Supabase SQL Editor con rol propietario; idempotente.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_uq
  ON public.users(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_status_role_idx ON public.users(status, role);
-- Acceso directo por anon/authenticated sigue prohibido; FastAPI decide RBAC.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users, public.audit_logs FROM anon, authenticated;
COMMIT;
