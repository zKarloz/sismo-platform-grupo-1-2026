/** Estado de sesión: el rol real proviene de /auth/me, nunca del navegador. */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authClient } from './client';

export type Role = 'administrador' | 'analista' | 'operador_alertas' | 'auditor' | 'solo_lectura';
export type Profile = { id: string; auth_user_id: string; email: string; full_name: string; role: Role; status: string };
type AuthContextType = {
  profile: Profile | null;
  loading: boolean;
  error: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};
const AuthContext = createContext<AuthContextType | null>(null);
const API = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

async function loadProfile(accessToken: string): Promise<Profile> {
  const response = await fetch(`${API}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(response.status === 403
      ? 'Cuenta sin permisos. Solicita al administrador que vincule tu UUID de Supabase Auth.'
      : `La sesión no pudo validarse (HTTP ${response.status}).`);
  }
  return (await response.json()) as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    let generation = 0;
    const restore = async (session: Session | null) => {
      const current = ++generation;
      if (!session) { if (live) { setProfile(null); setLoading(false); } return; }
      try {
        const loaded = await loadProfile(session.access_token);
        if (live && current === generation) { setProfile(loaded); setError(''); }
      } catch (e) {
        if (live && current === generation) {
          setProfile(null);
          setError(e instanceof Error ? e.message : 'Error de autenticación');
        }
      } finally { if (live && current === generation) setLoading(false); }
    };
    if (!authClient) { setError('Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.'); setLoading(false); return; }
    const client = authClient;
    const { data } = client.auth.onAuthStateChange((_event, session) => { void restore(session); });
    void client.auth.getSession().then(({ data: sessionData }) => restore(sessionData.session));
    return () => { live = false; generation++; data.subscription.unsubscribe(); };
  }, []);

  const login = async (email: string, password: string) => {
    if (!authClient) throw new Error('Supabase Auth no configurado');
    const result = await authClient.auth.signInWithPassword({ email, password });
    if (result.error) throw new Error('Credenciales incorrectas o cuenta no confirmada');
    if (!result.data.session) throw new Error('Supabase no devolvió sesión');
    // Se valida en el backend, incluso si el proveedor aceptó la contraseña.
    let confirmed: Profile;
    try {
      confirmed = await loadProfile(result.data.session.access_token);
      // Inicio registrado de forma transaccional; si falla, no habilitar la UI.
      const recorded = await fetch(`${API}/api/v1/auth/session`, {
        method: 'POST', headers: { Authorization: `Bearer ${result.data.session.access_token}` },
      });
      if (!recorded.ok) throw new Error('No se pudo registrar el inicio de sesión en auditoría.');
    } catch (error) { await authClient.auth.signOut(); throw error; }
    setProfile(confirmed);
    setError('');
    setLoading(false);
  };
  const logout = async () => {
    await authClient?.auth.signOut();
    setProfile(null);
    setError('');
  };
  const refresh = async () => {
    const { data } = await authClient?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) { setProfile(null); return; }
    setProfile(await loadProfile(data.session.access_token));
  };
  const value = useMemo<AuthContextType>(() => ({ profile, loading, error, login, logout, refresh }), [profile, loading, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider requerido');
  return value;
}
