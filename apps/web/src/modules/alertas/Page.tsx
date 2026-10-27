/** Administración de alertas IGP: centro operativo, reglas y canal SMTP por pestañas.
 * La autorización y la simulación sin efectos secundarios se verifican en FastAPI.
 */
import {useCallback, useEffect, useState} from 'react';
import {AlertTriangle, BellPlus, BellRing, CheckCircle2, FlaskConical, MailCheck, RefreshCw, ShieldAlert} from 'lucide-react';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import TablePagination, {type TablePageSize} from '../../components/ui/TablePagination';
import {activateAlertRule, getAlertHistory, getAlertRules, getSimulationEvents,
  reviewAlert, simulateAlertRule} from '../../services/alerts';
import type {AlertItem, AlertRule, SimulationEvent, SimulationResult} from '../../services/alerts';
import {useAuth} from '../../auth/AuthProvider';
import RuleBuilder from './RuleBuilder';
import SmtpSettingsPanel, {GmailTestForm} from './SmtpSettingsPanel';

type Tab = 'centro' | 'reglas' | 'canales';
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
const when = (date?: string | null) => date
  ? new Date(date).toLocaleString('es-PE', {timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short'})
  : '—';

export default function AlertasPage() {
  const {profile} = useAuth();
  const isAdmin = profile?.role === 'administrador';
  const canReview = isAdmin || profile?.role === 'operador_alertas';
  const canSimulate = isAdmin || profile?.role === 'operador_alertas' || profile?.role === 'analista';
  const [tab, setTab] = useState<Tab>('centro');
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
  // Evitar una descarga de reglas e historial cuando solo se está usando SMTP.
  useEffect(() => {
    if (tab === 'canales') return;
    const abort = new AbortController();
    setLoading(true); setError('');
    const request = tab === 'centro'
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

  useEffect(() => {
    if (tab !== 'centro') return;
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

  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold text-main">Alertas internas</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">Gestiona reglas, avisos informativos y entregas relacionadas con eventos IGP/CENSIS.</p>
      </div>
      <button className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-4 py-2 text-sm text-main hover:bg-panel-alt"
        type="button" onClick={refresh}><RefreshCw size={16}/> Actualizar</button>
    </header>

    {/* Misma navegación subrayada de Fuentes de datos, sin apariencia de botones. */}
    <div role="tablist" aria-label="Apartados de alertas internas" className="flex flex-wrap gap-1 border-b border-border-ui">
      {([{id: 'centro', label: 'Centro de alertas'}, {id: 'reglas', label: 'Reglas'},
        {id: 'canales', label: 'Canales'}] as const).map(option => <button
          key={option.id} id={`alertas-tab-${option.id}`} type="button" role="tab"
          aria-controls={`alertas-panel-${option.id}`} aria-selected={tab === option.id}
          onClick={() => {setTab(option.id);setActionError('');}}
          className={`px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${tab === option.id
            ? 'border-b-2 border-accent text-main' : 'text-muted hover:text-main'}`}>
          {option.label}
        </button>)}
    </div>

    {actionError && <p role="alert" className="rounded-lg border border-red-400 p-3 text-sm text-red-700 dark:text-red-300">{actionError}</p>}
    {error && <p role="alert" className="rounded-lg border border-red-400 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {loading && <LoadingSpinner label="Consultando información IGP…"/>}

    {tab === 'centro' && <section id="alertas-panel-centro" role="tabpanel" aria-labelledby="alertas-tab-centro" aria-label="Centro de alertas" className="space-y-4">
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

    {tab === 'reglas' && <section id="alertas-panel-reglas" role="tabpanel" aria-labelledby="alertas-tab-reglas" className="space-y-4">
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

    {tab === 'canales' && <section id="alertas-panel-canales" role="tabpanel" aria-labelledby="alertas-tab-canales" className="space-y-3">
      {isAdmin ? <>
        <div className="flex justify-end">
          <button type="button" onClick={() => setGmailModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900">
            <MailCheck size={16}/> Probar mi Gmail desde la web (opcional)
          </button>
        </div>
        <SmtpSettingsPanel />
      </> : <div className="rounded-xl border border-border-ui bg-panel p-5 text-sm text-muted">
        <ShieldAlert size={18} className="mb-2"/>La configuración y las pruebas del correo SMTP requieren rol Administrador.
      </div>}
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
      title="Probar mi Gmail desde la web" description="Prueba técnica opcional; no genera avisos sísmicos.">
      {gmailModal && <GmailTestForm recipient={profile?.email ?? ''}/>}
    </Modal>}
    <p className="flex items-start gap-2 text-xs text-muted"><CheckCircle2 size={15} className="shrink-0"/>
      Avisos basados en sismos ya registrados por IGP/CENSIS; no equivalen a predicciones ni comunicados oficiales.</p>
  </main>;
}
