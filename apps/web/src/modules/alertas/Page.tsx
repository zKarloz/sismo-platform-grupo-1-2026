/** Fase 7: bandeja informativa. Las escrituras requieren autorización backend futura. */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import { activateAlertRule, getAlertHistory, getAlertRules, reviewAlert } from '../../services/alerts';
import { useAuth } from '../../auth/AuthProvider';
import type { AlertItem, AlertRule } from '../../services/alerts';

const statuses = [
  {value: '', label: 'Todos los estados'},
  {value: 'pending', label: 'Pendientes de revisión'},
  {value: 'approved', label: 'Aprobadas'},
  {value: 'sent', label: 'Publicadas / enviadas'},
  {value: 'failed', label: 'Con fallos'},
  {value: 'cancelled', label: 'Canceladas'},
];

const when = (date?: string | null) => date
  ? new Date(date).toLocaleString('es-PE', {timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short'})
  : '—';

export default function AlertasPage() {
  const {profile} = useAuth();
  const canApprove = ['administrador','operador_alertas'].includes(profile?.role ?? '');
  const isAdmin = profile?.role === 'administrador';
  const [actionError,setActionError] = useState('');
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [items, setItems] = useState<AlertItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(() => setReload(x => x + 1), []);
  const act = async (fn:()=>Promise<unknown>) => {
    setActionError('');
    try {await fn(); refresh();}
    catch(e){setActionError(e instanceof Error?e.message:'Acción denegada');}
  };
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    Promise.all([getAlertRules(abort.signal), getAlertHistory(page, status, abort.signal)])
      .then(([r, a]) => {setRules(r.items); setItems(a.items); setTotal(a.total); setError('');})
      .catch((e: unknown) => {if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Error de consulta');})
      .finally(() => {if (!abort.signal.aborted) setLoading(false);});
    return () => abort.abort();
  }, [page, status, reload]);
  useEffect(() => {const id = window.setInterval(refresh, 60_000); return () => window.clearInterval(id);}, [refresh]);

  return <main className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-accent">Operación · Fase 7</p>
        <h1 className="mt-2 text-3xl font-bold text-main">Centro de alertas informativas</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">Avisos posteriores a sismos registrados por fuentes verificadas. No son alertas tempranas ni comunicaciones oficiales del IGP o INDECI.</p>
      </div>
      <button className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-4 py-2 text-sm text-main hover:bg-panel-alt" type="button" onClick={refresh}>
        <RefreshCw size={16}/> Actualizar
      </button>
    </header>

    <section className="rounded-xl border border-border-ui bg-panel-alt p-4 text-sm text-main" aria-label="Limitaciones del centro">
      <div className="flex items-center gap-2 font-semibold"><ShieldAlert size={18}/> Avisos no oficiales</div>
      <p className="mt-1 text-muted">Las aprobaciones requieren un operador autenticado; las reglas solo las administra Administrador. La ingesta de GitHub Actions es horaria y puede retrasarse.</p>
    </section>

    {actionError && <p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">{actionError}</p>}

    <section aria-labelledby="rules-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h2 id="rules-title" className="text-xl font-semibold text-main">Reglas configuradas</h2><span className="text-xs text-muted">{rules.filter(rule => rule.enabled).length} activas · {rules.length} totales</span></div>
      {rules.length === 0 && !loading && !error && <p className="rounded-xl border border-border-ui bg-panel p-5 text-sm text-muted">No hay reglas. Un operador autorizado puede crear una regla de prueba desde Git Bash.</p>}
      <div className="grid gap-3 lg:grid-cols-2">{rules.map(rule => <article key={rule.id} className="rounded-xl border border-border-ui bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-main">{rule.name}</h3><span className="rounded-full bg-panel-alt px-3 py-1 text-xs text-main">{rule.enabled ? 'Activa' : 'Desactivada'}</span></div>
        <p className="mt-2 text-xs text-muted">{rule.source_name ?? 'Sin fuente'} · Magnitud ≥ {Number(rule.min_magnitude).toFixed(1)} · Canal {rule.channel === 'in_app' ? 'Centro interno' : 'Correo (requiere aprobación)'}</p>
        <p className="mt-1 text-xs text-muted">Prioridad {rule.severity} · {rule.requires_approval ? 'Aprobación humana' : 'Publicación interna automática'} · cooldown {Math.round(rule.cooldown_seconds / 60)} min</p>
        <p className="mt-1 text-xs text-soft">Activada: {when(rule.activated_at)}</p>
        {isAdmin && <button type="button" onClick={()=>void act(()=>activateAlertRule(rule.id,!rule.enabled))} className="mt-3 rounded-lg border border-border-ui bg-panel-alt px-3 py-2 text-xs font-semibold text-main hover:opacity-80">{rule.enabled?'Desactivar regla':'Activar regla'}</button>}
      </article>)}</div>
    </section>

    <section className="space-y-3" aria-labelledby="history-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="history-title" className="text-xl font-semibold text-main">Historial de avisos <span className="text-sm font-normal text-muted">({total})</span></h2>
        <label className="text-sm text-main">Estado <select aria-label="Filtrar alertas por estado" value={status} onChange={e => {setStatus(e.target.value);setPage(1);}} className="ml-2 rounded-lg border border-border-ui bg-panel p-2 text-main">{statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label></div>
      {error && <p className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300" role="alert">{error}. Comprueba la migración 004 y FastAPI.</p>}
      {loading && <p className="rounded-lg bg-panel p-4 text-muted">Cargando alertas...</p>}
      {!loading && !error && items.length === 0 && <p className="rounded-xl border border-border-ui bg-panel p-5 text-sm text-muted">Sin avisos para los filtros. Esto es normal antes de activar una regla y recibir nuevos eventos.</p>}
      <div className="space-y-3">{items.map(item => <article key={item.id} className="rounded-xl border border-border-ui bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3"><BellRing className="mt-1 shrink-0 text-accent" size={20}/><div><h3 className="font-semibold text-main">{item.title}</h3><p className="mt-1 text-xs text-muted">{item.rule_name} · {item.source_name} · Evento: {when(item.occurred_at)}</p></div></div>
          <span className="rounded-full bg-panel-alt px-3 py-1 text-xs font-medium text-main">{item.status}</span>
        </div>
        {canApprove && item.status==='pending' && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>void act(()=>reviewAlert(item.id,true))} className="rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Aprobar aviso</button><button type="button" onClick={()=>void act(()=>reviewAlert(item.id,false))} className="rounded-lg border border-border-ui px-3 py-2 text-xs text-muted">Cancelar aviso</button></div>}
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted">{item.message}</p>
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border-ui pt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Clock3 size={14}/> Creada {when(item.created_at)}</span>
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={14}/> Entrega: {item.delivery?.status ?? 'pendiente'} · {item.delivery?.attempts ?? 0} intentos</span>
          {item.delivery?.delivered_at && <span>Publicada: {when(item.delivery.delivered_at)}</span>}
          {item.delivery?.acknowledged_at && <span>Acuse: {when(item.delivery.acknowledged_at)}</span>}
          <a className="underline underline-offset-2 text-accent" href={item.source_url} target="_blank" rel="noreferrer">Consultar fuente</a>
        </div>
      </article>)}</div>
      {total > 20 && <div className="flex items-center justify-end gap-3"><button type="button" className="rounded-lg border border-border-ui bg-panel px-3 py-1.5 text-sm text-main disabled:opacity-50" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span className="text-sm text-muted">Página {page}</span><button type="button" className="rounded-lg border border-border-ui bg-panel px-3 py-1.5 text-sm text-main disabled:opacity-50" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Siguiente</button></div>}
      <p className="inline-flex items-center gap-2 text-xs text-muted"><AlertTriangle size={14}/> El estado «sent» en canal interno indica publicación en el centro, no lectura por un destinatario.</p>
    </section>
  </main>;
}
