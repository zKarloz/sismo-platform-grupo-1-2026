/** Gestión de identidades con paginación de servidor, etiquetas y modales administrativos. */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, RefreshCw, Search, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { apiAuthed } from '../../auth/api';
import { displayRole } from '../../lib/roleLabels';
import { CreateUserModal, EditUserModal, Tag, roles } from './UserModal';
import type { AppUser } from './UserModal';

type UsersResponse = {
  items: AppUser[]; page: number; page_size: number; pages: number; total: number; demo_enabled: boolean;
};
const selectClass = 'rounded-lg border border-border-ui bg-page px-3 py-2.5 text-sm text-main';

export default function Page() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'administrador';
  const [items, setItems] = useState<AppUser[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState<'create' | AppUser | null>(null);

  // Debounce: no consultar la API por cada tecla que presiona el usuario.
  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setQuery(search); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize),
      ...(query ? { q: query } : {}), ...(role ? { role } : {}), ...(status ? { status } : {}) });
    void apiAuthed<UsersResponse>(`/api/v1/admin/users?${params.toString()}`)
      .then((response) => {
        if (!active) return;
        setItems(response.items); setTotal(response.total); setPages(response.pages);
        setDemoEnabled(response.demo_enabled); setError('');
        // Volver a la última página cuando un filtro reduce los resultados.
        if (page > response.pages) setPage(response.pages);
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar usuarios'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, pageSize, query, role, status, tick]);

  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  const refreshed = (message: string) => {
    setModal(null); setInfo(message); setTick(x => x + 1);
  };

  return <main className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-accent">Administración · Fase 2</p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-main"><UsersRound size={28}/> Usuarios y roles</h1>
        <p className="mt-2 text-sm text-muted">Identidades verificadas por Supabase Auth y permisos controlados con RBAC.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setInfo(''); setTick(x => x + 1); }}
          className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-4 py-2.5 text-sm text-main hover:bg-panel-alt">
          <RefreshCw size={16}/> Actualizar
        </button>
        {isAdmin && <button onClick={() => { setInfo(''); setModal('create'); }}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
          <UserPlus size={17}/> Nuevo usuario
        </button>}
      </div>
    </header>

    <div className="flex items-start gap-2 rounded-xl border border-border-ui bg-panel-alt px-4 py-3 text-sm text-muted">
      <ShieldCheck size={18} className="mt-0.5 shrink-0"/>
      <span>Los administradores pueden invitar usuarios desde esta página. El vínculo con Supabase Auth es automático; no se almacenan contraseñas en nuestra base de datos.</span>
    </div>
    {error && <p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600">{error}</p>}
    {info && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100">{info}</p>}

    <section className="rounded-xl border border-border-ui bg-panel p-4" aria-label="Filtros de usuarios">
      <div className="grid gap-3 lg:grid-cols-[minmax(200px,1fr)_minmax(170px,200px)_minmax(150px,180px)]">
        <label className="relative block">
          <span className="sr-only">Buscar usuarios</span>
          <Search size={17} className="pointer-events-none absolute left-3 top-3 text-muted"/>
          <input type="search" value={search} maxLength={100} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o correo" className="w-full rounded-lg border border-border-ui bg-page py-2.5 pl-10 pr-3 text-sm text-main placeholder:text-muted"/>
        </label>
        <label className="block">
          <span className="sr-only">Filtrar por rol</span>
          <select className={`${selectClass} w-full`} value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>
            <option value="">Todos los roles</option>{roles.map(r => <option key={r} value={r}>{displayRole(r)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Filtrar por estado</span>
          <select className={`${selectClass} w-full`} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos los estados</option><option value="active">Activo</option>
            <option value="inactive">Inactivo</option><option value="suspended">Suspendido</option>
          </select>
        </label>
      </div>
    </section>

    <div className="overflow-x-auto rounded-xl border border-border-ui bg-panel">
      <table className="w-full min-w-[730px] text-left text-sm">
        <thead className="bg-panel-alt text-muted"><tr>
          <th className="px-4 py-3 font-semibold">Usuario</th>
          <th className="px-4 py-3 font-semibold">Identidad</th>
          <th className="px-4 py-3 font-semibold">Rol</th>
          <th className="px-4 py-3 font-semibold">Estado</th>
          {isAdmin && <th className="px-4 py-3 text-right font-semibold">Acciones</th>}
        </tr></thead>
        <tbody>
          {!loading && items.map(user => <tr key={user.id} className="border-t border-border-ui hover:bg-panel-alt/50">
            <td className="px-4 py-3"><div className="font-semibold text-main">{user.full_name} {user.id === profile?.id && <Tag variant="info">Tú</Tag>}</div>
              <div className="mt-0.5 text-xs text-muted">{user.email}</div></td>
            <td className="px-4 py-3"><Tag variant={user.auth_user_id ? 'success' : 'warning'}>{user.auth_user_id ? 'Vinculada' : 'Pendiente'}</Tag></td>
            <td className="px-4 py-3"><Tag variant={user.role === 'administrador' ? 'info' : 'neutral'}>{displayRole(user.role)}</Tag></td>
            <td className="px-4 py-3"><Tag variant={user.status === 'active' ? 'success' : 'warning'}>
              {user.status === 'active' ? 'Activo' : user.status === 'suspended' ? 'Suspendido' : 'Inactivo'}</Tag></td>
            {isAdmin && <td className="px-4 py-3 text-right">
              <button type="button" disabled={user.id === profile?.id} onClick={() => setModal(user)}
                title={user.id === profile?.id ? 'No puedes editar tu propia cuenta' : 'Editar rol y estado'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-ui bg-panel px-3 py-2 text-xs font-semibold text-main hover:bg-panel-alt disabled:cursor-not-allowed disabled:opacity-40">
                <Pencil size={14}/> Editar
              </button>
            </td>}
          </tr>)}
          {loading && <tr><td colSpan={isAdmin ? 5 : 4} className="px-4 py-12 text-center text-muted">Cargando usuarios…</td></tr>}
          {!loading && !error && items.length === 0 && <tr><td colSpan={isAdmin ? 5 : 4} className="px-4 py-12 text-center text-muted">No se encontraron usuarios.</td></tr>}
        </tbody>
      </table>
    </div>

    <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-ui bg-panel px-4 py-3 text-sm">
      <p className="text-muted" aria-live="polite">{start}–{end} de {total} usuarios</p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-muted">Por página
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className={selectClass}>
            <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
          </select>
        </label>
        <button type="button" aria-label="Página anterior" disabled={loading || page <= 1} onClick={() => setPage(x => Math.max(1, x - 1))}
          className="rounded-lg border border-border-ui p-2 text-main disabled:opacity-30"><ChevronLeft size={18}/></button>
        <span className="whitespace-nowrap text-muted">{page} / {pages}</span>
        <button type="button" aria-label="Página siguiente" disabled={loading || page >= pages} onClick={() => setPage(x => Math.min(pages, x + 1))}
          className="rounded-lg border border-border-ui p-2 text-main disabled:opacity-30"><ChevronRight size={18}/></button>
      </div>
    </footer>
    {!isAdmin && <p className="text-sm text-muted">Tu rol permite consultar los usuarios, sin crear cuentas ni modificar permisos.</p>}

    {modal === 'create' && <CreateUserModal demoEnabled={demoEnabled} onClose={() => setModal(null)}
      onCreated={message => { setPage(1); refreshed(message); }}/>}
    {modal && modal !== 'create' && <EditUserModal user={modal} onClose={() => setModal(null)}
      onSaved={() => refreshed('Permisos actualizados y registrados en auditoría.')}/>}
  </main>;
}
