/** Onboarding de invitaciones: Supabase Auth valida el enlace y guarda la clave. */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { authClient } from '../../auth/client';

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (!authClient) { setError('Supabase Auth no configurado'); setLoading(false); return; }
    const client = authClient;
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      if (live) { setAuthenticated(Boolean(session)); setLoading(false); }
    });
    void client.auth.getSession().then(({data}) => {
      if (live) { setAuthenticated(Boolean(data.session)); setLoading(false); }
    });
    return () => { live = false; subscription.data.subscription.unsubscribe(); };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (password.length < 12) { setError('Utiliza al menos 12 caracteres.'); return; }
    if (password !== repeat) { setError('Las contraseñas no coinciden.'); return; }
    if (!authClient) return;
    setBusy(true);
    try {
      const result = await authClient.auth.updateUser({password});
      if (result.error) throw new Error('Supabase no pudo guardar la contraseña. Verifica si tu enlace caducó.');
      setPassword(''); setRepeat('');
      navigate('/', {replace: true});
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la contraseña'); }
    finally { setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-page p-5 text-main">
    <section className="w-full max-w-md overflow-hidden rounded-xl border border-border-ui bg-panel shadow-lg">
      <header className="bg-sidebar p-7 text-white">
        <span className="flex size-11 items-center justify-center rounded-lg bg-sidebar-active text-sidebar-active-text"><KeyRound size={24}/></span>
        <h1 className="mt-4 text-xl font-bold">Configurar tu contraseña</h1>
        <p className="mt-1 text-sm text-sidebar-muted">Sistema de Monitoreo Sísmico V2</p>
      </header>
      <div className="space-y-4 p-7">
        {loading && <p role="status" className="text-sm text-muted">Verificando la invitación…</p>}
        {!loading && !authenticated && <div className="space-y-3">
          <p className="text-sm text-muted">No se encontró una invitación válida. Abre el enlace enviado a tu correo o solicita uno nuevo al Administrador.</p>
          <Link to="/login" className="inline-block rounded-lg border border-border-ui px-4 py-2 text-sm text-main">Ir al login</Link>
        </div>}
        {!loading && authenticated && <form onSubmit={e => void submit(e)} className="space-y-4">
          <p className="text-sm text-muted">Tu invitación fue reconocida. Crea una contraseña para futuros ingresos.</p>
          <label className="block text-sm font-medium">Nueva contraseña
            <input type="password" minLength={12} autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border-ui bg-page px-3 py-2.5 text-main"/>
          </label>
          <label className="block text-sm font-medium">Repetir contraseña
            <input type="password" minLength={12} autoComplete="new-password" required value={repeat} onChange={e => setRepeat(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border-ui bg-page px-3 py-2.5 text-main"/>
          </label>
          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-sidebar px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            <LockKeyhole size={17}/>{busy ? 'Guardando…' : 'Guardar contraseña y entrar'}
          </button>
          <p className="flex items-start gap-2 text-xs text-muted"><ShieldCheck size={16}/> La contraseña se transmite a Supabase Auth, no a nuestro backend.</p>
        </form>}
        {error && <p role="alert" className="rounded-lg border border-rose-300 p-3 text-sm text-rose-600">{error}</p>}
      </div>
    </section>
  </main>;
}
