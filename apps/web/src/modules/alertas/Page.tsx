/** Centro de alertas IGP: Bandeja, Reglas y Entregas con rutas propias.
 * Fase B: Entregas consulta la API protegida y paginada de alert_deliveries.
 * La autorización y la simulación sin efectos secundarios se verifican en FastAPI.
 */
import {useCallback, useEffect, useState} from 'react';
import {NavLink, useLocation} from 'react-router-dom';
import {AlertTriangle, BellPlus, BellRing, CheckCircle2, FlaskConical, MailCheck, RefreshCw} from 'lucide-react';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import TablePagination, {type TablePageSize} from '../../components/ui/TablePagination';
import {activateAlertRule, getAlertDeliveries, getAlertHistory, getAlertRules, getSimulationEvents,
  reviewAlert, simulateAlertRule} from '../../services/alerts';
import type {AlertDeliveryItem, AlertItem, AlertRule, SimulationEvent, SimulationResult} from '../../services/alerts';
import {useAuth} from '../../auth/AuthProvider';
import RuleBuilder from './RuleBuilder';
import SmtpSettingsPanel, {GmailTestForm} from './SmtpSettingsPanel';

type Tab = 'bandeja' | 'reglas' | 'entregas';
const statusOptions = [
  {value: '', label: 'Todos los estados'},
  {value: 'pending', label: 'Pendientes'},
  {value: 'approved', label: 'Aprobadas'},
  {value: 'sent', label: 'Enviadas'},
  {value: 'failed', label: 'Fallidas'},
  {value: 'cancelled', label: 'Canceladas'},
];
const statusNames: Record<AlertItem['status'], string> = {
  pending: 'Pendiente', approved: 'Aprobada', sent: 'Enviada', failed: 'Fallida', cancelled: 'Cancelada',
};
const statusColors: Record<AlertItem['status'], string> = {
  pending: 'border-amber-400/50 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
  approved: 'border-cyan-400/50 bg-cyan-50 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300',
  sent: 'border-emerald-400/50 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  failed: 'border-red-400/50 bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
  cancelled: 'border-border-ui bg-panel-alt text-muted',
};
const deliveryStatusNames: Record<AlertDeliveryItem['status'], string> = {
  pending: 'Pendiente', sent: 'Enviada', failed: 'Fallida', cancelled: 'Cancelada',
};
const deliveryStatusColors: Record<AlertDeliveryItem['status'], string> = {
  pending: statusColors.pending, sent: statusColors.sent,
  failed: statusColors.failed, cancelled: statusColors.cancelled,
};
// Un error ambiguo NO equivale a un rechazo confirmado del correo.
// La reserva permanece sin reintento automático hasta una revisión operativa.
const isUncertainDelivery = (item: AlertDeliveryItem) => item.error_code === 'SMTP_OUTCOME_UNKNOWN';
const deliveryLabel = (item: AlertDeliveryItem) => isUncertainDelivery(item)
  ? 'Revisión requerida' : deliveryStatusNames[item.status];
const deliveryColor = (item: AlertDeliveryItem) => isUncertainDelivery(item)
  ? 'border-amber-400/50 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
  : deliveryStatusColors[item.status];
const when = (date?: string | null) => date
  ? new Date(date).toLocaleString('es-PE', {timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short'})
  : '—';

export default function AlertasPage() {
  const {profile} = useAuth();
  const isAdmin = profile?.role === 'administrador';
  const canReview = isAdmin || profile?.role === 'operador_alertas';
  const canSimulate = isAdmin || profile?.role === 'operador_alertas' || profile?.role === 'analista';
  const canViewDeliveries = isAdmin || profile?.role === 'operador_alertas' || profile?.role === 'auditor';
  // La URL es la fuente de verdad: enlaces profundos y recargas conservan la pestaña.
  const {pathname} = useLocation();
  const tab: Tab = pathname.replace(/\/+$/, '').endsWith('/reglas') ? 'reglas'
    : pathname.replace(/\/+$/, '').endsWith('/entregas') ? 'entregas' : 'bandeja';
  // Los formularios se abren en el modal compartido, no en tarjetas expandibles.
  const [ruleModal, setRuleModal] = useState(false);
  const [simulationModal, setSimulationModal] = useState(false);
  const [gmailModal, setGmailModal] = useState(false);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [items, setItems] = useState<AlertItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(5);
  const [status, setStatus] = useState('');
  // Paginación y filtros independientes: cambiar de pestaña no pierde la Bandeja.
  const [deliveryItems, setDeliveryItems] = useState<AlertDeliveryItem[]>([]);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveryPageSize, setDeliveryPageSize] = useState<TablePageSize>(5);
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [deliveryChannel, setDeliveryChannel] = useState('');
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [simulationEvents, setSimulationEvents] = useState<SimulationEvent[]>([]);
  const [simulationRule, setSimulationRule] = useState('');
  const [simulationEvent, setSimulationEvent] = useState('');
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState('');

  const refresh = useCallback(() => setReload(n => n + 1), []);
  // Evitar consultas de reglas y bandeja cuando solo se revisa Entregas (Fase B).
  useEffect(() => {
    // Si el usuario cambia a Entregas durante una consulta, ocultar el spinner anterior.
    if (tab === 'entregas') {setLoading(false);setError('');return;}
    const abort = new AbortController();
    setLoading(true); setError('');
    const request = tab === 'bandeja'
      ? getAlertHistory(page, pageSize, status, abort.signal).then(response => {
          if (!abort.signal.aborted) {setItems(response.items); setTotal(response.total);}
        })
      : Promise.all([
          getAlertRules(abort.signal),
          canSimulate ? getSimulationEvents(abort.signal) : Promise.resolve({items: [] as SimulationEvent[]}),
        ]).then(([ruleResponse, eventResponse]) => {
          if (!abort.signal.aborted) {setRules(ruleResponse.items); setSimulationEvents(eventResponse.items);}
        });
    void request.catch((cause: unknown) => {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Error de consulta');
    }).finally(() => {if (!abort.signal.aborted) setLoading(false);});
    return () => abort.abort();
  }, [tab, page, pageSize, status, reload, canSimulate]);

  // Entregas se consulta solo al abrir la pestaña y con rol permitido.
  // El servidor también valida el rol; ocultar una pestaña no es seguridad.
  useEffect(() => {
    if (tab !== 'entregas' || !canViewDeliveries) return;
    const abort = new AbortController();
    setDeliveryLoading(true); setDeliveryError('');
    void getAlertDeliveries(deliveryPage, deliveryPageSize, deliveryStatus, deliveryChannel, abort.signal)
      .then(response => {
        if (!abort.signal.aborted) {setDeliveryItems(response.items); setDeliveryTotal(response.total);}
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted) setDeliveryError(cause instanceof Error ? cause.message : 'No se pudo consultar las entregas');
      })
      .finally(() => {if (!abort.signal.aborted) setDeliveryLoading(false);});
    return () => abort.abort();
  }, [tab, canViewDeliveries, deliveryPage, deliveryPageSize, deliveryStatus, deliveryChannel, reload]);

  useEffect(() => {
    if (tab !== 'bandeja') return;
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
  }, [refresh, tab]);

  async function executeAction(id: string, action: () => Promise<unknown>) {
    setActionError(''); setBusyId(id);
    try { await action(); refresh(); }
    catch (cause) {setActionError(cause instanceof Error ? cause.message : 'Acción denegada');}
    finally {setBusyId(null);}
  }
  async function runSimulation() {
    if (!simulationRule || !simulationEvent) return;
    setSimulationError(''); setSimulation(null); setSimulating(true);
    try {setSimulation(await simulateAlertRule(simulationRule, simulationEvent));}
    catch (cause) {setSimulationError(cause instanceof Error ? cause.message : 'No se pudo simular');}
    finally {setSimulating(false);}
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const deliveryPages = Math.max(1, Math.ceil(deliveryTotal / deliveryPageSize));

  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold text-main">Centro de alertas</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">Supervisa avisos registrados, administra reglas y consulta las entregas del sistema basadas en IGP/CENSIS.</p>
      </div>
      <button className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-4 py-2 text-sm text-main hover:bg-panel-alt"
        type="button" onClick={refresh}><RefreshCw size={16}/> Actualizar</button>
    </header>

    {/* Las pestañas son enlaces reales: navegación del navegador, URL persistente y estilo Fuentes. */}
    <nav aria-label="Vistas del Centro de alertas" className="flex flex-wrap gap-1 border-b border-border-ui">
      {([{id: 'bandeja', label: 'Bandeja', path: '/alertas'},
        {id: 'reglas', label: 'Reglas', path: '/alertas/reglas'},
        {id: 'entregas', label: 'Entregas', path: '/alertas/entregas'}] as const).map(option => <NavLink
          key={option.id} to={option.path} end onClick={() => setActionError('')}
          aria-current={tab === option.id ? 'page' : undefined}
          className={`px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${tab === option.id
            ? 'border-b-2 border-accent text-main' : 'text-muted hover:text-main'}`}>
          {option.label}
        </NavLink>)}
    </nav>

    {actionError && <p role="alert" className="rounded-lg border border-red-400 p-3 text-sm text-red-700 dark:text-red-300">{actionError}</p>}
    {error && <p role="alert" className="rounded-lg border border-red-400 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {loading && <LoadingSpinner label="Consultando información IGP…"/>}

    {tab === 'bandeja' && <section aria-label="Bandeja de alertas" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{total} avisos registrados</p>
        <label className="flex items-center gap-2 text-sm text-main">Estado
          <select aria-label="Filtrar alertas por estado" value={status}
            onChange={event => {setStatus(event.target.value);setPage(1);}}
            className="rounded-lg border border-border-ui bg-panel px-3 py-2 text-main">
            {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      {!loading && !error && items.length === 0 && <p className="rounded-xl border border-border-ui bg-panel p-5 text-sm text-muted">Todavía no hay avisos para este filtro.</p>}
      <div className="space-y-3">{items.map(item => <article key={item.id} className="rounded-xl border border-border-ui bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <BellRing className="mt-1 shrink-0 text-accent" size={20}/>
            <div className="min-w-0">
              <h2 className="font-semibold text-main">{item.title}</h2>
              <p className="mt-1 text-xs text-muted">{item.rule_name} · {item.source_name} · Sismo: {when(item.occurred_at)}</p>
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusColors[item.status]}`}>{statusNames[item.status]}</span>
        </div>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted">{item.message}</p>
        {canReview && item.status === 'pending' && <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busyId === item.id} onClick={() => void executeAction(item.id, () => reviewAlert(item.id, true))}
            className="rounded-lg border border-emerald-500/50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 disabled:opacity-40">Aprobar aviso</button>
          <button type="button" disabled={busyId === item.id} onClick={() => void executeAction(item.id, () => reviewAlert(item.id, false))}
            className="rounded-lg border border-border-ui px-3 py-2 text-xs text-main disabled:opacity-40">Cancelar aviso</button>
        </div>}
        <dl className="mt-4 grid gap-2 border-t border-border-ui pt-3 text-xs text-muted sm:grid-cols-2 lg:grid-cols-3">
          <div><dt>Creación</dt><dd className="text-main">{when(item.created_at)}</dd></div>
          <div><dt>Aprobación</dt><dd className="text-main">{item.approved_by_name ?? '—'}{item.approved_at ? ` · ${when(item.approved_at)}` : ''}</dd></div>
          <div><dt>Canal</dt><dd className="text-main">{item.channel === 'in_app' ? 'Centro interno' : 'Correo electrónico'}</dd></div>
          <div><dt>Entrega</dt><dd className="text-main">{item.delivery?.status ?? 'Sin entrega registrada'}</dd></div>
          <div><dt>Intentos</dt><dd className="text-main">{item.delivery?.attempts ?? 0}</dd></div>
          <div><dt>Último intento</dt><dd className="text-main">{when(item.delivery?.last_attempt_at)}</dd></div>
          <div><dt>Envío</dt><dd className="text-main">{when(item.delivery?.delivered_at)}</dd></div>
          <div><dt>Acuse</dt><dd className="text-main">{when(item.delivery?.acknowledged_at)}</dd></div>
          {item.delivery?.error_code && <div><dt>Error (código)</dt><dd className="font-semibold text-red-700 dark:text-red-300">{item.delivery.error_code}</dd></div>}
        </dl>
        {item.source_url.startsWith('https://') && <a href={item.source_url} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-block text-xs text-accent underline underline-offset-2">Consultar fuente IGP</a>}
      </article>)}</div>
      <div className="overflow-hidden rounded-xl border border-border-ui bg-panel">
        <TablePagination page={page} pages={pages} pageSize={pageSize}
          disabled={loading} onPageChange={setPage} onPageSizeChange={size => {setPageSize(size);setPage(1);}}/>
      </div>
      <p className="flex items-start gap-2 text-xs text-muted"><AlertTriangle size={15} className="shrink-0"/>
        Las alertas son informativas y posteriores al sismo. «Enviada» no demuestra lectura del destinatario ni constituye alerta oficial.</p>
    </section>}

    {tab === 'reglas' && <section aria-label="Reglas de alertas" className="space-y-4">
      {/* Los botones ocupan la barra de acciones; los formularios están en Modal. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canSimulate && <button type="button" onClick={() => {
          setSimulation(null); setSimulationError(''); setSimulationModal(true);
        }} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2.5 text-sm font-medium text-main hover:bg-panel-alt">
          <FlaskConical size={16}/> Probar regla
        </button>}
        {isAdmin && <button type="button" onClick={() => setRuleModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900">
          <BellPlus size={16}/> Crear regla de alerta
        </button>}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {rules.map(rule => <article key={rule.id} className="rounded-xl border border-border-ui bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-main">{rule.name}</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${rule.enabled
              ? 'border-emerald-400/50 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'border-red-400/50 bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'}`}>{rule.enabled ? 'Activa' : 'Inactiva'}</span>
          </div>
          <p className="mt-2 text-xs text-muted">IGP/CENSIS · M ≥ {Number(rule.min_magnitude).toFixed(1)} · {rule.channel === 'in_app' ? 'Centro interno' : 'Correo electrónico'}</p>
          <p className="mt-1 text-xs text-muted">Prioridad {rule.severity} · {rule.requires_approval ? 'Aprobación humana' : 'Publicación interna automática'} · Cooldown {Math.round(rule.cooldown_seconds / 60)} min</p>
          <p className="mt-1 text-xs text-muted">Última activación: {when(rule.activated_at)}</p>
          {isAdmin && <button type="button" disabled={busyId === rule.id}
            onClick={() => void executeAction(rule.id, () => activateAlertRule(rule.id, !rule.enabled))}
            className="mt-3 rounded-lg border border-border-ui bg-panel-alt px-3 py-2 text-xs font-semibold text-main disabled:opacity-40">{rule.enabled ? 'Desactivar' : 'Activar'} regla</button>}
        </article>)}
      </div>
      {!loading && !error && rules.length === 0 && <p className="rounded-lg border border-border-ui bg-panel p-4 text-sm text-muted">No hay reglas IGP configuradas.</p>}
    </section>}

    {tab === 'entregas' && <section aria-label="Entregas de alertas" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-main">Seguimiento de entregas</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Historial operativo IGP/CENSIS: canal, destinatario protegido, intentos y resultado.</p>
        </div>
        {isAdmin && <button type="button" onClick={() => setGmailModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900">
          <MailCheck size={16}/> Probar envío de correo
        </button>}
      </div>
      {!canViewDeliveries ? <p role="status" className="rounded-xl border border-border-ui bg-panel p-5 text-sm text-muted">
        El historial de entregas está disponible para Administrador, Operador de alertas y Auditor. No se muestran destinatarios a otros roles.
      </p> : <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{deliveryTotal} entregas registradas</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-main">Canal
              <select aria-label="Filtrar entregas por canal" value={deliveryChannel}
                onChange={e => {setDeliveryChannel(e.target.value);setDeliveryPage(1);}}
                className="rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main">
                <option value="">Todos</option><option value="email">Correo</option><option value="in_app">Interno</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-main">Estado
              <select aria-label="Filtrar entregas por estado" value={deliveryStatus}
                onChange={e => {setDeliveryStatus(e.target.value);setDeliveryPage(1);}}
                className="rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main">
                <option value="">Todos</option><option value="pending">Pendiente</option>
                <option value="sent">Enviada</option><option value="failed">Fallida</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </label>
          </div>
        </div>
        {deliveryError && <p role="alert" className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{deliveryError}</p>}
        {deliveryLoading && <LoadingSpinner label="Consultando entregas IGP…"/>}
        {/* Un solo contenedor visual para las filas y TablePagination, como en los otros módulos. */}
        <div className="overflow-hidden rounded-xl border border-border-ui bg-panel">
        {!deliveryLoading && !deliveryError && deliveryItems.length === 0 && <p className="p-5 text-sm text-muted">
          No hay entregas para los filtros seleccionados.
        </p>}
        {/* En móvil usamos tarjetas; en escritorio, tabla con las mismas entregas reales. */}
        {!deliveryLoading && !deliveryError && deliveryItems.length > 0 && <div className="divide-y divide-border-ui md:hidden">
          {deliveryItems.map(item => <article key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-main">{item.alert_title}</h3>
                <p className="mt-1 text-xs text-muted">{item.rule_name} · M {item.magnitude ?? '—'}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${deliveryColor(item)}`}>
                {deliveryLabel(item)}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted">
              <div><dt>Canal</dt><dd className="mt-1 text-main">{item.channel === 'email' ? 'Correo' : 'Interno'}</dd></div>
              <div><dt>Intentos</dt><dd className="mt-1 tabular-nums text-main">{item.attempts}</dd></div>
              <div className="col-span-2"><dt>Destinatario</dt><dd className="mt-1 break-all text-main">{item.destination_display}</dd></div>
              <div><dt>Último intento</dt><dd className="mt-1 text-main">{when(item.last_attempt_at)}</dd></div>
              <div><dt>Envío</dt><dd className="mt-1 text-main">{when(item.delivered_at)}</dd></div>
            </dl>
            <details className="mt-3 border-t border-border-ui pt-3 text-xs text-main">
              <summary className="cursor-pointer font-semibold">Ver detalles</summary>
              <dl className="mt-2 grid grid-cols-2 gap-3 text-muted">
                <div><dt>Creación</dt><dd className="text-main">{when(item.created_at)}</dd></div>
                <div><dt>Próximo intento</dt><dd className="text-main">{when(item.next_attempt_at)}</dd></div>
                <div><dt>Acuse</dt><dd className="text-main">{when(item.acknowledged_at)}</dd></div>
                <div><dt>Estado del aviso</dt><dd className="text-main">{statusNames[item.alert_status]}</dd></div>
                {item.error_code && <div className="col-span-2"><dt>Error (código)</dt><dd className="font-semibold text-red-700 dark:text-red-300">{item.error_code}</dd></div>}
                {isUncertainDelivery(item) && <p className="col-span-2 text-amber-800 dark:text-amber-300">El servidor SMTP podría haber aceptado el mensaje. Se suspendieron los reintentos automáticos; requiere revisión del administrador.</p>}
              </dl>
              {item.source_url.startsWith('https://') && <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-block text-accent underline underline-offset-2">Fuente IGP</a>}
            </details>
          </article>)}
        </div>}
        {!deliveryLoading && !deliveryError && deliveryItems.length > 0 && <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] border-collapse text-left text-xs">
            <thead className="border-b border-border-ui bg-panel-alt text-muted">
              <tr>
                {['Alerta / evento', 'Canal / destinatario', 'Estado', 'Intentos', 'Último intento', 'Envío', 'Detalle'].map(label =>
                  <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-ui">
              {deliveryItems.map(item => <tr key={item.id} className="align-top hover:bg-panel-alt/50">
                <td className="max-w-[260px] px-4 py-3">
                  <p className="font-semibold text-main">{item.alert_title}</p>
                  <p className="mt-1 text-muted">{item.rule_name} · M {item.magnitude ?? '—'} · {when(item.occurred_at)}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-main">{item.channel === 'email' ? 'Correo electrónico' : 'Centro interno'}</p>
                  <p className="mt-1 break-all text-muted">{item.destination_display}</p>
                </td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 font-semibold ${deliveryColor(item)}`}>
                  {deliveryLabel(item)}
                </span></td>
                <td className="px-4 py-3 tabular-nums text-main">{item.attempts}</td>
                <td className="whitespace-nowrap px-4 py-3 text-main">{when(item.last_attempt_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-main">{when(item.delivered_at)}</td>
                <td className="px-4 py-3"><details className="min-w-36 text-main">
                  <summary className="cursor-pointer font-semibold text-accent">Ver detalles</summary>
                  <dl className="mt-2 space-y-2 text-muted">
                    <div><dt>Creación</dt><dd className="text-main">{when(item.created_at)}</dd></div>
                    <div><dt>Próximo intento</dt><dd className="text-main">{when(item.next_attempt_at)}</dd></div>
                    <div><dt>Acuse</dt><dd className="text-main">{when(item.acknowledged_at)}</dd></div>
                    <div><dt>Estado del aviso</dt><dd className="text-main">{statusNames[item.alert_status]}</dd></div>
                    {item.error_code && <div><dt>Error (código)</dt><dd className="font-semibold text-red-700 dark:text-red-300">{item.error_code}</dd></div>}
                    {isUncertainDelivery(item) && <p className="text-amber-800 dark:text-amber-300">El servidor SMTP podría haber aceptado el mensaje. Sin reintentos automáticos; requiere revisión del administrador.</p>}
                  </dl>
                  {item.source_url.startsWith('https://') && <a href={item.source_url}
                    target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-accent underline underline-offset-2">Fuente IGP</a>}
                </details></td>
              </tr>)}
            </tbody>
          </table>
        </div>}
          <TablePagination page={deliveryPage} pages={deliveryPages} pageSize={deliveryPageSize}
            disabled={deliveryLoading} onPageChange={setDeliveryPage}
            onPageSizeChange={size => {setDeliveryPageSize(size);setDeliveryPage(1);}}/>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>
          «Enviada» significa publicación interna o aceptación SMTP; no confirma recepción ni lectura. Los avisos son informativos y posteriores al sismo.
        </p>
      </>}
      {isAdmin && <details className="rounded-xl border border-border-ui bg-panel">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-main">Configuración técnica del correo (administración)</summary>
        <div className="px-3 pb-3 sm:px-4 sm:pb-4"><SmtpSettingsPanel/></div>
      </details>}
    </section>}
    {/* Formularios montados en el modal compartido: focus trap, Escape y desenfoque uniformes. */}
    {isAdmin && <Modal open={ruleModal} onClose={() => setRuleModal(false)}
      title="Crear regla de alerta" description="La regla se guardará desactivada y deberá activarse con autorización.">
      <RuleBuilder onCreated={refresh}/>
    </Modal>}
    <Modal open={simulationModal && canSimulate} onClose={() => {if (!simulating) setSimulationModal(false);}}
      title="Probar regla sin generar alertas" description="Simulación de reglas con eventos IGP/CENSIS, sin envíos ni escrituras.">
      <div className="space-y-4">
        <p className="text-xs text-muted">Selecciona una regla y un evento IGP reciente. La simulación no envía correos, no crea avisos ni modifica datos.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-main">Regla
            <select value={simulationRule} onChange={event => {setSimulationRule(event.target.value);setSimulation(null);}}
              className="mt-1 w-full rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main">
              <option value="">Seleccionar regla</option>{rules.map(rule => <option key={rule.id} value={rule.id}>{rule.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-main">Evento sísmico
            <select value={simulationEvent} onChange={event => {setSimulationEvent(event.target.value);setSimulation(null);}}
              className="mt-1 w-full rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main">
              <option value="">Seleccionar evento</option>{simulationEvents.map(item => <option key={item.id} value={item.id}>
                {when(item.occurred_at)} · M {item.magnitude ?? '—'} · {item.place ?? 'Sin lugar'}
              </option>)}
            </select>
          </label>
        </div>
        <button type="button" disabled={!simulationRule || !simulationEvent || simulating}
          onClick={() => void runSimulation()}
          className="rounded-lg border border-border-ui bg-panel-alt px-4 py-2 text-sm font-semibold text-main disabled:opacity-40">
          {simulating ? <LoadingSpinner variant="inline" size="sm" label="Simulando…"/> : 'Ejecutar simulación'}</button>
        {simulationError && <p role="alert" className="rounded-lg border border-red-400 p-3 text-sm text-red-700 dark:text-red-300">{simulationError}</p>}
        {simulation && <p role="status" className={`rounded-lg border p-3 text-sm ${simulation.match
          ? 'border-emerald-400/50 bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300'
          : 'border-amber-400/50 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'}`}>
          {simulation.match ? 'El evento cumple la regla.' : `El evento no cumple la regla: ${simulation.reason}.`} Solo simulación; no se ha generado una alerta.
        </p>}
      </div>
    </Modal>
    {isAdmin && <Modal open={gmailModal} onClose={() => setGmailModal(false)}
      title="Probar envío de correo" description="Prueba técnica opcional de Gmail SMTP; no genera avisos sísmicos.">
      {gmailModal && <GmailTestForm recipient={profile?.email ?? ''}/>}
    </Modal>}
    <p className="flex items-start gap-2 text-xs text-muted"><CheckCircle2 size={15} className="shrink-0"/>
      Avisos basados en sismos ya registrados por IGP/CENSIS; no equivalen a predicciones ni comunicados oficiales.</p>
  </main>;
}
