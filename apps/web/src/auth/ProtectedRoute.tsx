/** Protección UX adicional: FastAPI siempre repite la comprobación de permisos. */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Activity } from 'lucide-react';
import type { Role } from './AuthProvider';

export function RequireSession({children}: {children: ReactNode}) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return (
    /* UI_GLOBAL_02: validación visual, nunca mostrar contenido protegido antes del perfil. */
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-10 text-main" aria-busy="true">
      <div className="w-full max-w-md rounded-2xl border border-border-ui bg-panel px-7 py-9 text-center shadow-sm sm:px-10 sm:py-11">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Activity size={27} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Monitoreo sísmico · Perú</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-main">Validando sesión</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Estamos verificando tu identidad y los permisos de acceso.</p>
        <LoadingSpinner size="lg" label="Verificando credenciales…" className="mt-7 text-accent" />
      </div>
    </div>
  );
  if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const { profile } = useAuth();
  if (!profile || !roles.includes(profile.role)) {
    return <div className="rounded-xl border border-border-ui bg-panel p-8 text-main">
      <h1 className="text-xl font-semibold">Acceso restringido</h1>
      <p className="mt-2 text-sm text-muted">Tu perfil no dispone de permisos para este módulo.</p>
    </div>;
  }
  return <Outlet />;
}
