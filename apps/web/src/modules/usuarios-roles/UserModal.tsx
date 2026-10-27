/** Modales accesibles de alta y edición; credenciales nunca se conservan tras cerrar. */
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { KeyRound, Mail, ShieldCheck, UserPlus } from 'lucide-react';
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
  last_login_at: string | null;
};

export const roles: Role[] = ['administrador', 'analista', 'operador_alertas', 'auditor', 'solo_lectura'];
const field = 'w-full rounded-lg border border-border-ui bg-page px-3 py-2.5 text-sm text-main outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const button = 'rounded-lg border border-border-ui bg-panel px-4 py-2.5 text-sm font-semibold text-main transition-colors hover:bg-panel-alt disabled:opacity-50';

export function Tag({ children, variant = 'neutral' }: {
  children: ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const palette = {
    neutral: 'bg-panel-alt text-muted border-border-ui',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-300 dark:border-emerald-500/30',
    warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-400/15 dark:text-amber-300 dark:border-amber-500/30',
    danger: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-400/15 dark:text-rose-300 dark:border-rose-500/30',
    info: 'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-600',
  };
  return <span className={`inline-flex max-w-full items-center rounded-md border px-2.5 py-1 text-xs font-medium ${palette[variant]}`}>{children}</span>;
}

/** Alta y edición usan el mismo modal que Detalles, Auditoría y Reportes.
 * El encabezado, el portal, el desenfoque y el bloqueo de scroll son globales.
 */
function ModalFrame({ title, description, onClose, children }: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return <Modal open title={title} description={description} onClose={onClose}>
    {children}
  </Modal>;
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
    <form onSubmit={e => void submit(e)} className="space-y-4">
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
          {busy ? <LoadingSpinner size="sm" variant="inline" label="Registrando…" /> : <><UserPlus size={16}/>{mode === 'invite' ? 'Enviar invitación' : 'Crear cuenta de prueba'}</>}
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
    <form onSubmit={e => void submit(e)} className="space-y-4">
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
          {busy ? <LoadingSpinner size="sm" variant="inline" label="Guardando…" /> : 'Guardar cambios'}
        </button>
      </div>
    </form>
  </ModalFrame>;
}


/** Consulta de identidad. Permisos mostrados únicamente para endpoints comprobados.
 * MFA no se deduce de tener una cuenta vinculada a Supabase Auth.
 */
export function UserDetailsModal({ user, onClose }: {user: AppUser; onClose: () => void}) {
  const canRead = user.role === 'administrador' || user.role === 'auditor';
  const canEdit = user.role === 'administrador';
  const value = (allowed: boolean) => <Tag variant={allowed ? 'success' : 'neutral'}>
    {allowed ? 'Permitido' : 'Sin permiso'}
  </Tag>;

  return <Modal open title="Detalle del usuario" description="Identidad y permisos en el módulo Usuarios y roles."
    onClose={onClose} footer={<button type="button" className={button} onClick={onClose}>Cerrar</button>}>
    <div className="space-y-4 text-sm text-main">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs text-muted">Nombre completo</dt><dd className="font-medium">{user.full_name}</dd></div>
        <div><dt className="text-xs text-muted">Correo electrónico</dt><dd className="break-all font-medium">{user.email}</dd></div>
        <div><dt className="text-xs text-muted">Rol asignado</dt><dd>{displayRole(user.role)}</dd></div>
        <div><dt className="text-xs text-muted">Estado de acceso</dt><dd><Tag variant={user.status === 'active' ? 'success' : user.status === 'suspended' ? 'warning' : 'danger'}>
          {user.status === 'active' ? 'Activo' : user.status === 'suspended' ? 'Suspendido' : 'Inactivo'}
        </Tag></dd></div>
        <div><dt className="text-xs text-muted">Identidad Supabase</dt><dd>{user.auth_user_id ? 'Vinculada' : 'Pendiente de vinculación'}</dd></div>
        <div><dt className="text-xs text-muted">MFA</dt><dd>Información no disponible en la API actual</dd></div>
        <div><dt className="text-xs text-muted">Último acceso registrado</dt><dd>{user.last_login_at
          ? new Date(user.last_login_at).toLocaleString('es-PE',{timeZone:'America/Lima'}) : 'Aún no registrado'}</dd></div>
        <div><dt className="text-xs text-muted">Fecha de alta</dt><dd>{new Date(user.created_at).toLocaleDateString('es-PE',{timeZone:'America/Lima'})}</dd></div>
      </dl>
      <div className="rounded-lg border border-border-ui p-3">
        <h3 className="font-semibold">Permisos del rol en Usuarios y roles</h3>
        <p className="mt-1 text-xs text-muted">Autorización aplicada por FastAPI; no equivale a una matriz completa de permisos de toda la plataforma.</p>
        <dl className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-3"><dt>Consultar usuarios</dt><dd>{value(canRead)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt>Invitar usuarios</dt><dd>{value(canEdit)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt>Editar rol y estado</dt><dd>{value(canEdit)}</dd></div>
        </dl>
      </div>
      <p className="text-xs text-muted">Los accesos efectivos también requieren una cuenta activa y vinculada. La configuración MFA se administra en el proveedor de autenticación.</p>
    </div>
  </Modal>;
}
