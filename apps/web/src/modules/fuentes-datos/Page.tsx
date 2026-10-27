/** Operación IGP/CENSIS: estado del conector e historial persistido en Supabase.
 * La automatización corresponde a GitHub Actions, nunca al navegador.
 */
import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, Database, ExternalLink, History, RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import TablePagination, { type TablePageSize } from '../../components/ui/TablePagination';
import { getIGPRuns, getSources } from '../../services/seismic';
import type { DataSource, IngestionHistory, IngestionRun, IngestionStatus } from '../../types/seismic';

const ACTIONS_URL = 'https://github.com/zKarloz/sismo-platform-grupo-1-2026/actions/workflows/igp-sync.yml';

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('es-PE', {
    timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short',
  }) : 'Sin registros';
}
function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return 'En curso o sin dato';
  return seconds >= 60 ? `${(seconds / 60).toFixed(1)} min` : `${seconds.toFixed(1)} s`;
}

/** Estado del lote; nunca confundir «conector activo» con un lote completo. */
function Status({ status }: { status: string | null | undefined }) {
  const dictionary: Record<string, { label: string; css: string }> = {
    success: { label: 'Correcto', css: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
    active: { label: 'Activo', css: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
    partial: { label: 'Parcial', css: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    running: { label: 'En curso', css: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    planned: { label: 'Planificado', css: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    paused: { label: 'Pausado', css: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    error: { label: 'Con error', css: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300' },
    failed: { label: 'Fallido', css: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300' },
  };
  const current = dictionary[status ?? ''] ?? { label: 'Sin información', css: 'border-border-ui bg-panel-alt text-muted' };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${current.css}`}>{current.label}</span>;
}

export default function Page() {
  const { profile } = useAuth();
  const [source, setSource] = useState<DataSource | null>(null);
  const [loadingSource, setLoadingSource] = useState(true);
  const [sourceError, setSourceError] = useState('');
  const [history, setHistory] = useState<IngestionHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(5);
  const [status, setStatus] = useState<IngestionStatus | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Igual que en Auditoría: cada pestaña muestra una sola vista funcional.
  const [activeTab, setActiveTab] = useState<'ultima' | 'historial'>('ultima');

  useEffect(() => {
    const controller = new AbortController();
    setLoadingSource(true);
    getSources(controller.signal)
      .then(data => { if (!controller.signal.aborted) { setSource(data.items.find(item => item.name === 'IGP/CENSIS') ?? null); setSourceError(''); } })
      .catch(err => { if (!controller.signal.aborted) setSourceError(err instanceof Error ? err.message : 'No se pudo consultar la fuente'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingSource(false); });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    // La tabla solo consulta el historial cuando el usuario abre su pestaña.
    if (activeTab !== 'historial') return;
    const controller = new AbortController();
    setLoadingHistory(true);
    getIGPRuns(page, pageSize, status, controller.signal)
      .then(data => { if (!controller.signal.aborted) {
        setHistory(data); setHistoryError('');
        if (data.page !== page) setPage(data.page);
      } })
      .catch(err => { if (!controller.signal.aborted) setHistoryError(err instanceof Error ? err.message : 'No se pudieron consultar las ejecuciones'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingHistory(false); });
    return () => controller.abort();
  }, [activeTab, page, pageSize, status, revision]);

  const lastRun: IngestionRun | null = source?.last_run ?? null;
  // Puede estar configurado como «activo» aunque el último lote haya fallado o sea parcial.
  const canOpenActions = profile?.role === 'administrador' || profile?.role === 'operador_alertas';

  return <main className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold text-main">Fuentes de datos</h1>
        <p className="mt-2 text-sm text-muted">Supervisa los conectores y la sincronización de información sísmica.</p>
      </div>
      <button type="button" onClick={() => setRevision(value => value + 1)}
        className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-4 py-2.5 text-sm font-medium text-main hover:bg-panel-alt">
        <RefreshCw size={16}/> Actualizar
      </button>
    </header>

    <div className="flex flex-wrap gap-1 border-b border-border-ui" role="tablist" aria-label="Vistas de fuentes de datos">
      <button type="button" id="fuentes-tab-ultima" role="tab" aria-selected={activeTab === 'ultima'}
        aria-controls="fuentes-panel-ultima" onClick={() => setActiveTab('ultima')}
        className={`px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${activeTab === 'ultima' ? 'border-b-2 border-accent text-main' : 'text-muted hover:text-main'}`}>
        Última sincronización
      </button>
      <button type="button" id="fuentes-tab-historial" role="tab" aria-selected={activeTab === 'historial'}
        aria-controls="fuentes-panel-historial" onClick={() => setActiveTab('historial')}
        className={`px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${activeTab === 'historial' ? 'border-b-2 border-accent text-main' : 'text-muted hover:text-main'}`}>
        <History size={15} className="mr-1 inline-block"/> Historial de sincronizaciones
      </button>
    </div>

    {activeTab === 'ultima' && <div id="fuentes-panel-ultima" role="tabpanel" aria-labelledby="fuentes-tab-ultima" className="space-y-4">
    {sourceError && <p role="alert" className="rounded-xl border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">{sourceError}</p>}
    <section aria-label="Conector IGP" className="rounded-2xl border border-border-ui bg-panel p-5">
      {loadingSource ? <LoadingSpinner label="Consultando conector IGP…" /> : !source ?
        <div className="py-6 text-center text-sm text-muted">IGP/CENSIS todavía no figura en las fuentes registradas.</div> : <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-panel-alt p-2 text-accent"><Database size={20}/></span>
            <div>
              <h2 className="font-semibold text-main">IGP / CENSIS</h2>
              <p className="text-xs text-muted">{source.organization}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Conector:</span><Status status={source.status}/>
            <span className="text-xs text-muted">Último lote:</span><Status status={lastRun?.status}/>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-muted">Última ejecución</dt><dd className="mt-1 text-sm font-medium text-main">{formatDate(lastRun?.started_at)}</dd></div>
          <div><dt className="text-xs text-muted">Último éxito completo</dt><dd className="mt-1 text-sm font-medium text-main">{formatDate(source.last_success_at)}</dd></div>
          <div><dt className="text-xs text-muted">Duración del último lote</dt><dd className="mt-1 text-sm font-medium text-main">{lastRun?.started_at && lastRun.finished_at ? formatDuration((new Date(lastRun.finished_at).getTime() - new Date(lastRun.started_at).getTime()) / 1000) : 'En curso o sin dato'}</dd></div>
          <div><dt className="text-xs text-muted">Frecuencia programada</dt><dd className="mt-1 text-sm font-medium text-main">Cada hora · GitHub Actions</dd></div>
        </dl>
        <p className="mt-4 text-xs text-muted">Último lote: {lastRun ? `${lastRun.records_seen} vistos · ${lastRun.records_inserted} nuevos · ${lastRun.records_updated} actualizados` : 'sin registros'}. Los omitidos se describen en el historial, si hubo incidencias.</p>
        <p className="mt-2 text-xs text-muted">Programa: minuto 17 de cada hora (UTC) y conciliación diaria de 2026 a las 08:33 UTC. La ejecución puede retrasarse.</p>
        <details className="mt-4 border-t border-border-ui pt-4 text-sm text-main">
          <summary className="cursor-pointer font-medium">Información del conector</summary>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Organización</dt><dd>Instituto Geofísico del Perú · CENSIS</dd></div>
            <div><dt className="text-xs text-muted">Tipo</dt><dd>{source.source_type.toUpperCase()}</dd></div>
            <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-muted">URL/API</dt><dd className="break-all text-xs">{source.base_url.startsWith('https://') ? <a href={source.base_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.base_url} <ExternalLink size={12} className="inline"/></a> : source.base_url}</dd></div>
            <div><dt className="text-xs text-muted">Límite de la tarea programada</dt><dd>Hasta 100 reportes recientes por ciclo. No equivale al límite del servicio IGP.</dd></div>
            <div><dt className="text-xs text-muted">Contacto</dt><dd>No registrado en la configuración actual.</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted">Licencia y atribución</dt><dd>{source.license_notes || 'Condiciones de reutilización pendientes de verificar.'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted">Configuración privada</dt><dd>Referencia: GitHub Actions Secrets (`DATABASE_URL`), valores no expuestos en la aplicación.</dd></div>
          </dl>
        </details>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-ui pt-4">
          <p className="text-xs text-muted">La web solo consulta estados y registros; no ejecuta la ingesta.</p>
          {canOpenActions && <a href={ACTIONS_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main hover:bg-panel-alt">
            <ExternalLink size={15}/> Abrir GitHub Actions
          </a>}
        </div>
      </>}
    </section>
    </div>}

    {activeTab === 'historial' && <section id="fuentes-panel-historial" role="tabpanel" aria-labelledby="fuentes-tab-historial"
      className="overflow-hidden rounded-2xl border border-border-ui bg-panel">
      <div className="flex flex-wrap items-center justify-end gap-3 border-b border-border-ui px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-muted">Resultado
          <select aria-label="Filtrar ejecuciones por resultado" value={status} onChange={e => {setStatus(e.target.value as IngestionStatus | ''); setPage(1); setExpandedId(null);}}
            className="rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main">
            <option value="">Todos</option><option value="success">Correcto</option><option value="partial">Parcial</option>
            <option value="failed">Fallido</option><option value="running">En curso</option>
          </select>
        </label>
      </div>
      {historyError && <p role="alert" className="mx-4 my-3 rounded-lg border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">{historyError}</p>}
      {loadingHistory ? <LoadingSpinner label="Consultando historial IGP…" /> : !history?.items.length ?
        <p className="px-4 py-10 text-center text-sm text-muted">No hay ejecuciones registradas para el filtro seleccionado.</p> :
        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full text-left text-sm">
            <thead className="bg-panel-alt text-xs text-muted"><tr>
              <th className="px-4 py-3 font-medium">Inicio (Perú)</th><th className="px-4 py-3 font-medium">Resultado</th>
              <th className="px-4 py-3 text-right font-medium">Vistos</th><th className="px-4 py-3 text-right font-medium">Nuevos</th>
              <th className="px-4 py-3 text-right font-medium">Duración</th><th className="px-4 py-3 text-right font-medium">Detalle</th>
            </tr></thead>
            <tbody className="divide-y divide-border-ui">
              {history.items.map(run => <Fragment key={run.id}>
                <tr key={run.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-main">{formatDate(run.started_at)}</td>
                  <td className="px-4 py-3"><Status status={run.status}/></td>
                  <td className="px-4 py-3 text-right tabular-nums text-main">{run.records_seen}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-main">{run.records_inserted}</td>
                  <td className="px-4 py-3 text-right text-main">{formatDuration(run.duration_seconds)}</td>
                  <td className="px-4 py-3 text-right"><button type="button" aria-expanded={expandedId === run.id}
                    aria-label={`Ver detalle de ejecución ${run.id}`}
                    onClick={() => setExpandedId(value => value === run.id ? null : run.id)}
                    className="rounded-lg p-2 text-main hover:bg-panel-alt">
                    <ChevronDown size={17} className={`transition-transform duration-200 ${expandedId === run.id ? 'rotate-180' : ''}`}/>
                  </button></td>
                </tr>
                {expandedId === run.id && <tr key={`${run.id}:detail`} className="bg-panel-alt">
                  <td colSpan={6} className="px-4 py-4 text-xs text-main">
                    {/* Duración ya aparece en la fila principal; no repetirla en el detalle. */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div><span className="text-muted">Finalización: </span>{formatDate(run.finished_at)}</div>
                      <div><span className="text-muted">Actualizados: </span>{run.records_updated}</div>
                      <div><span className="text-muted">ID ejecución: </span><span className="break-all">{run.id}</span></div>
                    </div>
                    {/* Advertencias con fondo amarillo claro y ámbar oscuro, sin cambiar la paleta global. */}
                    {(run.error_summary || run.status === 'partial') &&
                      <div className="mt-3 break-words rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-yellow-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
                        {run.error_summary && <p><strong>Observación:</strong> {run.error_summary}</p>}
                        {run.status === 'partial' && <p className={run.error_summary ? 'mt-2' : ''}>
                          Parcial: no significa que el catálogo se haya sincronizado completamente.
                        </p>}
                      </div>}
                  </td>
                </tr>}
              </Fragment>)}
            </tbody>
          </table>
        </div>}
      <TablePagination page={history?.page ?? page} pages={history?.pages ?? 1} pageSize={pageSize}
        onPageChange={next => { setPage(next); setExpandedId(null); }}
        onPageSizeChange={next => {setPageSize(next); setPage(1); setExpandedId(null);}}
        disabled={loadingHistory}/>
    </section>}
  </main>;
}
