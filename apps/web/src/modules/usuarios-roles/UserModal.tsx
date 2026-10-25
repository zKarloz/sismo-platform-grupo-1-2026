/** Modales accesibles de alta y edición; credenciales nunca se conservan tras cerrar. */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { KeyRound, Mail, ShieldCheck, UserPlus, X } from 'lucide-react';
import { apiAuthed } from '../../auth/api';
import type { Role } from '../../auth/AuthProvider';
import { displayRole } from '../../lib/roleLabels';

export type AppUser = {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  role: Role;
  status: string;
  created_at: string;
};

export const roles: Role[] = ['administrador', 'analista', 'operador_alertas', 'auditor', 'solo_lectura'];
const field = 'w-full rounded-lg border border-border-ui bg-page px-3 py-2.5 text-sm text-main outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const button = 'rounded-lg border border-border-ui bg-panel px-4 py-2.5 text-sm font-semibold text-main transition-colors hover:bg-panel-alt disabled:opacity-50';

export function Tag({ children, variant = 'neutral' }: {
  children: ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'info';
}) {
  const palette = {
    neutral: 'bg-panel-alt text-muted border-border-ui',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-600',
    warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-600',
    info: 'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-600',
  };
  return <span className={`inline-flex max-w-full items-center rounded-md border px-2.5 py-1 text-xs font-medium ${palette[variant]}`}>{children}</span>;
}

function ModalFrame({ title, description, onClose, children }: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const modal = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = modal.current?.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),button:not([disabled])');
    first?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus.current?.focus(); };
  }, []);
  const onKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const focusables = Array.from(modal.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]',
      ) ?? []);
      if (!focusables.length) return;
      if (event.shiftKey && document.activeElement === focusables[0]) {
        event.preventDefault(); focusables[focusables.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusables[focusables.length - 1]) {
        event.preventDefault(); focusables[0].focus();
      }
    }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={onKeys}>
      <div ref={modal} role="dialog" aria-modal="true" aria-labelledby="modal-usuarios-titulo"
        aria-describedby="modal-usuarios-descripcion"
        className="max-h-[min(92vh,800px)] w-full max-w-xl overflow-y-auto rounded-xl border border-border-ui bg-panel shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border-ui bg-panel px-5 py-4 sm:px-6">
          <div>
            <h2 id="modal-usuarios-titulo" className="text-lg font-bold text-main">{title}</h2>
            <p id="modal-usuarios-descripcion" className="mt-1 text-sm text-muted">{description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar ventana"
            className="rounded-lg p-2 text-muted hover:bg-panel-alt hover:text-main"><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CreateUserModal({ demoEnabled, onClose, onCreated }: {
  demoEnabled: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('solo_lectura');
  const [mode, setMode] = useState<'invite' | 'demo'>('invite');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await apiAuthed('/api/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ full_name: name.trim(), email: email.trim(), role, mode,
          ...(mode === 'demo' ? { password } : {}) }),
      });
      setPassword('');
      onCreated(mode === 'invite'
        ? `Invitación creada para ${email.trim()}. Comprueba que el correo haya llegado.`
        : 'Cuenta de demostración creada. Entrega la contraseña temporal de manera privada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear la cuenta');
    } finally { setBusy(false); }
  };
  return <ModalFrame title="Nuevo usuario" description="Registro administrado y vinculado automáticamente con Supabase Auth." onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={e => void submit(e)} className="space-y-4 px-5 py-5 sm:px-6">
      <div>
        <label htmlFor="nuevo-nombre" className="mb-1.5 block text-sm font-medium text-main">Nombre completo</label>
        <input id="nuevo-nombre" required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del integrante" className={field}/>
      </div>
      <div>
        <label htmlFor="nuevo-email" className="mb-1.5 block text-sm font-medium text-main">Correo electrónico</label>
        <input id="nuevo-email" required type="email" maxLength={254} autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} placeholder="integrante@correo.com" className={field}/>
      </div>
      <div>
        <label htmlFor="nuevo-rol" className="mb-1.5 block text-sm font-medium text-main">Rol inicial</label>
        <select id="nuevo-rol" value={role} onChange={e => setRole(e.target.value as Role)} className={field}>
          {roles.map(r => <option key={r} value={r}>{displayRole(r)}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">Solo Administrador puede asignar permisos. Por defecto: Solo lectura.</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-main">Método de registro</legend>
        <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${mode === 'invite' ? 'border-accent bg-accent-soft' : 'border-border-ui'}`}>
          <input type="radio" name="modo" value="invite" checked={mode === 'invite'} onChange={() => setMode('invite')}/>
          <span><span className="flex items-center gap-2 text-sm font-semibold text-main"><Mail size={16}/> Invitación por correo</span>
            <span className="mt-1 block text-xs text-muted">El integrante recibe un enlace y configura su propia contraseña.</span></span>
        </label>
        {demoEnabled && <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${mode === 'demo' ? 'border-accent bg-accent-soft' : 'border-border-ui'}`}>
          <input type="radio" name="modo" value="demo" checked={mode === 'demo'} onChange={() => setMode('demo')}/>
          <span><span className="flex items-center gap-2 text-sm font-semibold text-main"><KeyRound size={16}/> Cuenta ficticia de demostración</span>
            <span className="mt-1 block text-xs text-muted">Solo entorno de desarrollo, correo .test y contraseña temporal.</span></span>
        </label>}
      </fieldset>
      {mode === 'demo' && demoEnabled && <div>
        <label htmlFor="nuevo-temporal" className="mb-1.5 block text-sm font-medium text-main">Contraseña temporal (mínimo 12 caracteres)</label>
        <input id="nuevo-temporal" type="password" required minLength={12} maxLength={128} autoComplete="new-password"
          value={password} onChange={e => setPassword(e.target.value)} className={field}/>
        <p className="mt-1 text-xs text-muted">No se guardará en nuestra BD. Compártela de forma segura con su titular.</p>
      </div>}
      <div className="flex items-start gap-2 rounded-lg bg-panel-alt p-3 text-xs text-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0"/>
        <p>Solo FastAPI maneja la credencial administrativa. Las invitaciones requieren un correo real y pueden estar sujetas a límites de Supabase Auth.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-300 p-3 text-sm text-rose-600">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border-ui pt-4">
        <button type="button" disabled={busy} onClick={onClose} className={button}>Cancelar</button>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
          <UserPlus size={16}/>{busy ? 'Registrando…' : mode === 'invite' ? 'Enviar invitación' : 'Crear cuenta de prueba'}
        </button>
      </div>
    </form>
  </ModalFrame>;
}

export function EditUserModal({ user, onClose, onSaved }: {
  user: AppUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<Role>(user.role);
  const [status, setStatus] = useState(user.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await apiAuthed(`/api/v1/admin/users/${user.id}`, {
        method: 'PATCH', body: JSON.stringify({ role, status }),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar');
    } finally { setBusy(false); }
  };
  return <ModalFrame title="Editar permisos" description={`Cuenta de ${user.full_name}`} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={e => void submit(e)} className="space-y-4 px-5 py-5 sm:px-6">
      <p className="rounded-lg bg-panel-alt p-3 text-sm text-muted">{user.email}</p>
      <div>
        <label htmlFor="editar-rol" className="mb-1.5 block text-sm font-medium text-main">Rol</label>
        <select id="editar-rol" value={role} onChange={e => setRole(e.target.value as Role)} className={field}>
          {roles.map(r => <option key={r} value={r}>{displayRole(r)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="editar-estado" className="mb-1.5 block text-sm font-medium text-main">Estado de acceso</label>
        <select id="editar-estado" value={status} onChange={e => setStatus(e.target.value)} className={field}>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="suspended">Suspendido</option>
        </select>
      </div>
      <p className="text-xs text-muted">Los cambios quedarán registrados en Auditoría. No puedes modificar tu propia cuenta.</p>
      {error && <p role="alert" className="rounded-lg border border-rose-300 p-3 text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border-ui pt-4">
        <button type="button" disabled={busy} onClick={onClose} className={button}>Cancelar</button>
        <button type="submit" disabled={busy || (role === user.role && status === user.status)}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  </ModalFrame>;
}
