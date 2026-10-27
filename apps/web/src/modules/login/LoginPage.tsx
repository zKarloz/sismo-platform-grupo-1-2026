/** Inicio de sesión sin registro público. Cuentas creadas por administrador en Supabase Auth. */
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const { profile, login, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as {from?: string} | null)?.from ?? '/';
  if (profile) return <Navigate to="/" replace />;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setMessage('');
    try { await login(email.trim(), password); navigate(backTo.startsWith('/') && !backTo.startsWith('//') ? backTo : '/', {replace: true}); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo iniciar sesión'); }
    finally { setSubmitting(false); setPassword(''); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-page p-6 text-main">
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border-ui bg-panel shadow-xl shadow-black/5">
      <div className="bg-sidebar px-8 py-9 text-white">
        <span className="flex size-12 items-center justify-center rounded-xl bg-sidebar-active text-sidebar-active-text"><Activity size={27}/></span>
        <h1 className="mt-6 text-2xl font-bold">Sismo Platform</h1>
        <p className="mt-2 text-sm text-sidebar-muted">Acceso seguro · Sistema de Monitoreo Sísmico V2</p>
      </div>
      <form onSubmit={submit} className="space-y-5 px-8 py-8">
        <div><h2 className="text-xl font-semibold">Iniciar sesión</h2><p className="mt-1 text-sm text-muted">Utiliza tu cuenta habilitada por el administrador.</p></div>
        <label className="block text-sm font-medium">Correo electrónico<input required autoComplete="username" type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-border-ui bg-page px-4 py-3 text-main outline-accent" placeholder="usuario@dominio.com"/></label>
        <label className="block text-sm font-medium">Contraseña<input required autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-border-ui bg-page px-4 py-3 text-main outline-accent"/></label>
        {(message || error) && <p role="alert" className="rounded-lg border border-rose-400/50 p-3 text-sm text-rose-600 dark:text-rose-300">{message || error}</p>}
        <button disabled={submitting} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sidebar px-5 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50">{submitting ? <LoadingSpinner size="sm" variant="inline" label="Validando…" /> : <><LogIn size={18}/>Ingresar</>}</button>
        <p className="flex items-start gap-2 text-xs leading-5 text-muted"><ShieldCheck size={16} className="mt-0.5 shrink-0"/>Identidad verificada por Supabase Auth. Los permisos se administran en FastAPI.</p>
        <p className="flex items-start gap-2 text-xs leading-5 text-muted"><LockKeyhole size={16} className="mt-0.5 shrink-0"/>Plataforma informativa; no emite alertas tempranas oficiales.</p>
      </form>
    </div>
  </main>;
}
