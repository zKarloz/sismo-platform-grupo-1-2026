/** Protección UX adicional: FastAPI siempre repite la comprobación de permisos. */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import type { Role } from './AuthProvider';

export function RequireSession({children}: {children: ReactNode}) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-page text-muted">Validando sesión…</div>;
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
