/** Panel de usuarios: las mutaciones se validan por JWT + rol en FastAPI. */
import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { apiAuthed } from '../../auth/api';
import type { Role } from '../../auth/AuthProvider';

type User = { id: string; auth_user_id: string | null; email: string; full_name: string; role: Role; status: string; created_at: string };
const roles: {value: Role; label: string}[] = [
  {value:'administrador', label:'Administrador'},
  {value:'analista', label:'Analista'},
  {value:'operador_alertas', label:'Operador de alertas'},
  {value:'auditor', label:'Auditor'},
  {value:'solo_lectura', label:'Solo lectura'},
];

export default function Page() {
  const {profile} = useAuth();
  const [items, setItems] = useState<User[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [tick, setTick] = useState(0);
  const isAdmin = profile?.role === 'administrador';
  useEffect(() => {
    let alive = true;
    void apiAuthed<{items: User[]}>('/api/v1/admin/users')
      .then(res => {if (alive) {setItems(res.items); setError('');}})
      .catch(e => {if (alive) setError(e instanceof Error ? e.message : 'Consulta fallida');});
    return () => { alive = false; };
  }, [tick]);
  const update = async (user: User, change: {role?: Role; status?: string}) => {
    setBusy(user.id); setError(''); setInfo('');
    try {
      await apiAuthed(`/api/v1/admin/users/${user.id}`, {method:'PATCH', body:JSON.stringify(change)});
      setInfo('Cambio registrado en auditoría.'); setTick(x=>x+1);
    } catch(e) {setError(e instanceof Error ? e.message : 'No se pudo guardar');}
    finally {setBusy('');}
  };
  return <main className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div>
      <p className="text-xs font-bold uppercase tracking-widest text-accent">Administración · Fase 2</p>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-main"><UsersRound size={28}/> Usuarios y roles</h1>
      <p className="mt-2 text-sm text-muted">Control de acceso por función, asociado al UUID verificado de Supabase Auth.</p>
    </div><button onClick={()=>setTick(x=>x+1)} className="flex items-center gap-2 rounded-lg border border-border-ui bg-panel p-3 text-sm text-main"><RefreshCw size={17}/> Actualizar</button></header>
    <div className="rounded-xl border border-border-ui bg-panel-alt p-4 text-sm text-muted"><ShieldCheck size={17} className="mr-2 inline-block"/> Las nuevas cuentas se crean en Supabase Auth y se vinculan mediante CLI privado. No se almacenan contraseñas en PostgreSQL.</div>
    {error && <p role="alert" className="rounded-xl border border-rose-400 p-4 text-sm text-rose-600">{error}</p>}
    {info && <p role="status" className="rounded-xl border border-border-ui bg-panel p-4 text-sm text-main">{info}</p>}
    <div className="overflow-x-auto rounded-xl border border-border-ui bg-panel"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-panel-alt text-muted"><tr><th className="p-4">Usuario</th><th className="p-4">Identidad Auth</th><th className="p-4">Rol</th><th className="p-4">Estado</th></tr></thead><tbody>
      {items.map(user=><tr key={user.id} className="border-t border-border-ui"><td className="p-4"><strong className="block text-main">{user.full_name}</strong><span className="text-muted">{user.email}</span>{user.id === profile?.id && <span className="ml-2 text-xs text-accent">(tú)</span>}</td>
        <td className="p-4 text-muted">{user.auth_user_id ? <span className="text-emerald-600 dark:text-emerald-400">Vinculada</span> : 'Sin vincular'}</td>
        <td className="p-4"><select aria-label={`Rol de ${user.full_name}`} disabled={!isAdmin || busy === user.id || user.id === profile?.id} value={user.role} onChange={e=>void update(user,{role:e.target.value as Role})} className="w-full rounded-lg border border-border-ui bg-page p-2 text-main disabled:opacity-60">{roles.map(r=><option value={r.value} key={r.value}>{r.label}</option>)}</select></td>
        <td className="p-4"><select aria-label={`Estado de ${user.full_name}`} disabled={!isAdmin || busy === user.id || user.id === profile?.id} value={user.status} onChange={e=>void update(user,{status:e.target.value})} className="rounded-lg border border-border-ui bg-page p-2 text-main disabled:opacity-60"><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="suspended">Suspendido</option></select></td></tr>)}
      {!items.length && <tr><td colSpan={4} className="p-6 text-muted">No hay usuarios disponibles.</td></tr>}
    </tbody></table></div>
    {!isAdmin && <p className="text-sm text-muted">Tu rol permite consultar usuarios, pero no modificar sus permisos.</p>}
  </main>;
}
