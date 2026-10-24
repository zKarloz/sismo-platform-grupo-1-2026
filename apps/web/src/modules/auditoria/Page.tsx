/** Historial legible: responsables, rol actual, acciones humanas y trazabilidad opcional. */
import { useEffect, useMemo, useState } from 'react';
import { Activity, BellRing, Bot, CheckCircle2, ChevronRight, History, LogIn, RefreshCw, Settings2, ShieldCheck, UserRound, UsersRound, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiAuthed } from '../../auth/api';
import { displayRole } from '../../lib/roleLabels';

type Details = Record<string, unknown> | null;
type Entry = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  subject_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  result: string;
  occurred_at: string;
  before_json: Details;
  after_json: Details;
};

type Category = 'accesos' | 'usuarios' | 'reglas' | 'alertas' | 'sistema';
const operations: Record<string, { title: string; category: Category; icon: LucideIcon }> = {
  'identity.session.started': { title: 'Inicio de sesión', category: 'accesos', icon: LogIn },
  'identity.user.updated': { title: 'Permisos de usuario modificados', category: 'usuarios', icon: UsersRound },
  'alert.rule.created': { title: 'Regla de alertas creada', category: 'reglas', icon: Settings2 },
  'alert.smtp.test.requested': { title: 'Prueba de Gmail solicitada', category: 'sistema', icon: Activity },
  'alert.smtp.test.accepted': { title: 'Prueba de Gmail aceptada por SMTP', category: 'sistema', icon: CheckCircle2 },
  'alert.rule.activated': { title: 'Regla de alertas activada', category: 'reglas', icon: ShieldCheck },
  'alert.rule.disabled': { title: 'Regla de alertas desactivada', category: 'reglas', icon: Settings2 },
  'alert.generated': { title: 'Aviso informativo generado', category: 'alertas', icon: BellRing },
  'alert.approved': { title: 'Aviso aprobado', category: 'alertas', icon: CheckCircle2 },
  'alert.cancelled': { title: 'Aviso cancelado', category: 'alertas', icon: XCircle },
  'alert.delivery.sent': { title: 'Aviso publicado', category: 'alertas', icon: BellRing },
  'alert.delivery.failed': { title: 'Falló la publicación de un aviso', category: 'alertas', icon: XCircle },
  'alert.delivery.acknowledged': { title: 'Recepción de aviso confirmada', category: 'alertas', icon: CheckCircle2 },
};

const statusNames: Record<string, string> = {
  active: 'Activo', inactive: 'Inactivo', suspended: 'Suspendido',
  pending: 'Pendiente', approved: 'Aprobado', sent: 'Publicado',
  failed: 'Fallido', cancelled: 'Cancelado',
  in_app: 'Centro interno', email: 'Correo electrónico',
  success: 'Correcto', partial: 'Parcial',
  review: 'Revisión', high: 'Alta', informational: 'Informativa',
};

/** Describe campos habituales sin exponer objetos JSON en la vista normal. */
function prettyValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Sin dato';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (key === 'role' && typeof value === 'string') return displayRole(value);
  if (typeof value === 'string') return statusNames[value] ?? value;
  if (typeof value === 'number') return String(value);
  return 'Valor estructurado';
}
const fieldNames: Record<string, string> = {
  role: 'Rol', status: 'Estado', enabled: 'Activada',
  source: 'Fuente', channel: 'Canal', attempts: 'Intentos',
  severity: 'Prioridad', requires_approval: 'Requiere aprobación',
};

function describe(entry: Entry): string {
  const before = entry.before_json ?? {};
  const after = entry.after_json ?? {};
  if (entry.action === 'identity.session.started') return 'Acceso autenticado mediante Supabase Auth.';
  if (entry.action === 'identity.user.updated') {
    const changes = Object.keys(after).filter((key) => key in fieldNames && before[key] !== after[key])
      .map((key) => `${fieldNames[key]}: ${prettyValue(key, before[key])} → ${prettyValue(key, after[key])}`);
    return changes.length ? changes.join(' · ') : 'Se actualizaron los permisos de una cuenta.';
  }
  if (entry.action === 'alert.smtp.test.requested') return 'Un Administrador solicitó una prueba técnica de Gmail. No se guardan credenciales.';
  if (entry.action === 'alert.smtp.test.accepted') return 'Gmail aceptó el mensaje de prueba; no es una alerta sísmica.';
  if (entry.action === 'alert.rule.created') {
    const source = typeof after.source === 'string' ? after.source : null;
    const channel = after.channel ? prettyValue('channel', after.channel) : null;
    return [source && `Fuente ${source}`, channel && `Canal ${channel}`].filter(Boolean).join(' · ') || 'Nueva regla configurada, inicialmente desactivada.';
  }
  if (entry.action === 'alert.rule.activated') return 'La regla quedó habilitada para evaluar eventos nuevos.';
  if (entry.action === 'alert.rule.disabled') return 'Se suspendió la evaluación de la regla.';
  if (entry.action === 'alert.generated') return 'Un evento registrado cumplió las condiciones de una regla.';
  if (entry.action === 'alert.approved') return 'Se autorizó la publicación del aviso.';
  if (entry.action === 'alert.cancelled') return 'El aviso fue cancelado y no se publicará.';
  if (entry.action === 'alert.delivery.sent') return 'La publicación del aviso quedó registrada.';
  if (entry.action === 'alert.delivery.failed') return 'Hubo un problema en un intento de publicación.';
  if (entry.action === 'alert.delivery.acknowledged') return 'Un operador registró un acuse del aviso.';
  return 'Operación registrada en la bitácora del sistema.';
}

function formatDate(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Fecha no disponible';
  return `${parsed.toLocaleString('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })} · hora de Perú`;
}

export default function Page() {
  const [items, setItems] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category | 'todos'>('todos');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void apiAuthed<{ items: Entry[] }>('/api/v1/admin/audit?limit=100')
      .then((response) => { if (alive) { setItems(response.items); setError(''); } })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : 'Error de auditoría'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tick]);

  const visible = useMemo(() => items.filter((item) => {
    const category = operations[item.action]?.category ?? 'sistema';
    return filter === 'todos' || filter === category;
  }), [items, filter]);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Control interno · Fase 2</p>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-main"><History size={28} aria-hidden="true" /> Auditoría</h1>
          <p className="mt-2 text-sm text-muted">Quién realizó cada operación, cuándo ocurrió y qué cambió.</p>
        </div>
        <button type="button" onClick={() => setTick((n) => n + 1)} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-4 py-2.5 text-sm text-main transition-colors hover:bg-panel-alt disabled:opacity-50">
          <RefreshCw size={16} aria-hidden="true" /> Actualizar
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-ui bg-panel px-4 py-3">
        <p className="text-sm text-muted"><strong className="text-main">{visible.length}</strong> {visible.length === 1 ? 'actividad' : 'actividades'} en la vista</p>
        <label className="flex items-center gap-2 text-sm text-muted" htmlFor="filtrar-auditoria">
          Tipo de actividad
          <select id="filtrar-auditoria" value={filter} onChange={(event) => setFilter(event.target.value as Category | 'todos')}
            className="rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main">
            <option value="todos">Todas</option>
            <option value="accesos">Accesos</option>
            <option value="usuarios">Usuarios</option>
            <option value="reglas">Reglas</option>
            <option value="alertas">Alertas</option>
            <option value="sistema">Otras</option>
          </select>
        </label>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600">{error}</p>}
      {loading && <p role="status" className="text-sm text-muted">Cargando historial de auditoría…</p>}

      <div className="space-y-3" aria-label="Registros de auditoría">
        {!loading && !error && visible.map((item) => {
          const operation = operations[item.action] ?? { title: 'Actividad del sistema', category: 'sistema', icon: Activity };
          const Icon = operation.icon;
          const actorName = item.actor_id ? (item.actor_name || 'Usuario no disponible') : 'Sistema automatizado';
          const actorRole = item.actor_id ? (item.actor_role ? displayRole(item.actor_role) : 'Rol no disponible') : 'Proceso automático';
          const subject = item.entity_type === 'users' && item.action === 'identity.user.updated' && item.subject_name
            ? `Cuenta afectada: ${item.subject_name}` : null;
          return (
            <article key={item.id} className="rounded-xl border border-border-ui bg-panel p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-panel-alt text-accent"><Icon size={19} aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-main">{operation.title}</h2>
                    <p className="mt-1 text-sm text-muted">{describe(item)}</p>
                    {subject && <p className="mt-1 text-sm font-medium text-main">{subject}</p>}
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-panel-alt px-2 py-1 text-xs font-medium text-muted">
                  {item.result === 'success' ? <CheckCircle2 size={14} aria-hidden="true" /> : <XCircle size={14} aria-hidden="true" />}
                  {statusNames[item.result] ?? 'Registrado'}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-border-ui pt-3">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  {item.actor_id ? <UserRound size={17} className="shrink-0 text-muted" aria-hidden="true" /> : <Bot size={17} className="shrink-0 text-muted" aria-hidden="true" />}
                  <strong className="truncate text-main">{actorName}</strong>
                  <span className="rounded-md bg-panel-alt px-2 py-0.5 text-xs text-muted">{actorRole}</span>
                </div>
                <time dateTime={item.occurred_at} className="text-xs text-muted">{formatDate(item.occurred_at)}</time>
              </div>
              <details className="group mt-3 text-sm">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted hover:text-main">
                  <ChevronRight size={15} className="transition-transform group-open:rotate-90" aria-hidden="true" />
                  Ver detalles técnicos
                </summary>
                <div className="mt-3 space-y-2 rounded-lg bg-panel-alt p-3 text-xs text-muted">
                  <p><strong>Operación:</strong> {item.action}</p>
                  <p className="break-all"><strong>ID de registro:</strong> {item.id}</p>
                  {item.entity_id && <p className="break-all"><strong>Referencia:</strong> {item.entity_type} · {item.entity_id}</p>}
                  {(item.before_json || item.after_json) && (
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-border-ui pt-2 font-mono text-xs">{JSON.stringify({ antes: item.before_json, despues: item.after_json }, null, 2)}</pre>
                  )}
                </div>
              </details>
            </article>
          );
        })}
        {!loading && !error && visible.length === 0 && (
          <div className="rounded-xl border border-border-ui bg-panel p-7 text-center text-sm text-muted">
            No hay actividades registradas para el filtro seleccionado.
          </div>
        )}
      </div>
      <p className="text-xs text-soft">El rol mostrado es el rol actual de la cuenta. El historial anterior no conserva una copia del rol en el instante de cada acción. Se muestran hasta 100 registros recientes.</p>
    </section>
  );
}
