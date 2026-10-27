/** Dashboard ejecutivo IGP/CENSIS.
 * Evita sumar USGS al catálogo IGP y presenta solamente un gráfico a la vez.
 * La capa de reportes recientes no se suma al inventario almacenado.
 */
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowUpRight, Bell, Database, RefreshCw, Ruler } from 'lucide-react';
import StatCard from '../../components/StatCard';
import FilterBar from '../../components/analytics/FilterBar';
import ChartSwitcher from '../../components/analytics/ChartSwitcher';
import AppliedFiltersAside from '../../components/analytics/AppliedFiltersAside';
import { MagnitudesChart, SeriesChart } from '../../components/analytics/Charts';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { useIGPFeed } from '../../hooks/useIGPFeed';
import { getDashboardOperations, getMagnitudes, getSummary, getTimeSeries } from '../../services/analytics';
import { withCurrentPeruMonth } from '../../lib/peruMonth';
import { getSources } from '../../services/seismic';
import { IGP_OFFICIAL_URL, igpFreshnessWarning, peruDate } from '../../services/igp';
import type { DashboardOperations, Summary, MagnitudeDistribution, TimeSeries } from '../../types/analytics';
import type { DataSource } from '../../types/seismic';

type ChartId = 'events' | 'magnitudes';
const charts: { id: ChartId; label: string }[] = [
  { id: 'events', label: 'Eventos por día' },
  { id: 'magnitudes', label: 'Distribución por magnitud' },
];

function coverage(part: number | undefined, total: number | undefined) {
  return total ? `${((100 * (part ?? 0)) / total).toFixed(1)} %` : '—';
}

export default function DashboardPage() {
  const { filters, revision } = useAnalyticsFilters();
  const effectiveFilters = useMemo(() => withCurrentPeruMonth(filters), [filters, revision]);
  // Se impone IGP/CENSIS incluso si queda un filtro anterior almacenado en el contexto.
  const [chart, setChart] = useState<ChartId>('events');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<TimeSeries | null>(null);
  const [magnitudes, setMagnitudes] = useState<MagnitudeDistribution | null>(null);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [operations, setOperations] = useState<DashboardOperations | null>(null);
  const [operationsError, setOperationsError] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const igpLatest = useIGPFeed('latest');
  const igpRecent = useIGPFeed('recent');
  const lastEvent = igpLatest.data?.items[0] ?? null;
  const warning = igpLatest.data ? igpFreshnessWarning(igpLatest.data) : null;

  useEffect(() => {
    const controller = new AbortController();
    const igpFilters = effectiveFilters;
    setLoading(true);
    setError('');
    setSummary(null);
    setSeries(null);
    setMagnitudes(null);
    setSources([]);
    Promise.all([
      getSummary(igpFilters, controller.signal),
      getTimeSeries(igpFilters, 'day', controller.signal),
      getMagnitudes(igpFilters, controller.signal),
    ]).then(([s, t, m]) => {
      if (controller.signal.aborted) return;
      setSummary(s);
      setSeries(t);
      setMagnitudes(m);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los indicadores IGP');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    // El estado del conector es independiente: si falla su consulta, los KPI siguen disponibles.
    getDashboardOperations(controller.signal)
      .then(data => { if (!controller.signal.aborted) { setOperations(data); setOperationsError(false); } })
      .catch(() => { if (!controller.signal.aborted) { setOperations(null); setOperationsError(true); } });
    getSources(controller.signal)
      .then(response => {
        if (!controller.signal.aborted) setSources(response.items.filter(source => source.name === 'IGP/CENSIS'));
      })
      .catch(() => { if (!controller.signal.aborted) setSources([]); });
    return () => controller.abort();
  }, [effectiveFilters, revision]);

  const lastRun = operations?.last_run;
  const runDuration = lastRun?.started_at && lastRun.finished_at
    ? (Date.parse(lastRun.finished_at) - Date.parse(lastRun.started_at)) / 1000 : null;
  const lastSync = operations?.last_success_at ?? sources.map(item => item.last_success_at).filter((value): value is string => Boolean(value)).sort().at(-1);
  const selectedCount = chart === 'events' ? series?.total : magnitudes?.total;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">IGP/CENSIS · Datos observados</p>
        <h1 className="mt-1 text-3xl font-bold text-main">Dashboard sísmico</h1>
        <p className="mt-1 text-sm text-muted">Estado ejecutivo del catálogo IGP sincronizado y sus conectores. No ofrece predicciones ni alerta temprana.</p>
      </div>
      <FilterBar currentMonthDefault />
    </header>

    {error && <p role="alert" className="rounded-xl border border-rose-400 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">{error}. Comprueba FastAPI y la conexión a Supabase.</p>}
    {(igpLatest.error || igpRecent.error) && <p role="status" className="rounded-xl border border-border-ui bg-panel p-3 text-sm text-main">
      {igpLatest.error ? `Último sismo: ${igpLatest.error}. ` : ''}{igpRecent.error ? `Reportes IGP: ${igpRecent.error}.` : ''}
    </p>}

    <section aria-label="Indicadores ejecutivos IGP" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Eventos IGP almacenados" value={loading || !summary ? '—' : summary.total.toLocaleString('es-PE')} detail="Catálogo sincronizado y filtros aplicados" icon={Activity} />
      <StatCard label="Profundidad media" value={loading || summary?.avg_depth_km == null ? '—' : `${summary.avg_depth_km.toFixed(1)} km`} detail="Solo registros con profundidad" icon={Ruler} />
      <StatCard label="Profundidad mediana" value={loading || summary?.median_depth_km == null ? '—' : `${summary.median_depth_km.toFixed(1)} km`} detail="Mismo subconjunto de eventos" icon={Ruler} />
      <StatCard label="Avisos abiertos IGP" value={operations?.open_alerts == null ? '—' : String(operations.open_alerts)}
        detail="Pendientes de revisión o aprobación; no son alertas tempranas" icon={Bell} />
    </section>

    <section aria-label="Gráficos y filtros aplicados" className="flex flex-col gap-4 xl:flex-row">
      <article className="min-w-0 flex-1 rounded-2xl border border-border-ui bg-panel p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-main">Visualización de eventos IGP</h2>
            <p className="mt-1 text-xs text-muted">IGP sincronizado · Mes actual de Perú por defecto · Agrupación diaria UTC</p>
          </div>
          <ChartSwitcher choices={charts} value={chart} onChange={setChart} />
        </div>
        <div className="mt-5" aria-live="polite">
          {loading ? <LoadingSpinner label="Actualizando gráfico…" className="h-72" />
            : chart === 'events' ? <SeriesChart data={series} /> : <MagnitudesChart data={magnitudes} />}
        </div>
        <p className="mt-3 text-xs text-soft">
          {chart === 'events' ? 'Unidad: eventos por día UTC; los días vacíos pueden omitirse.' : 'Cantidad por magnitud; no representa una escala de peligro.'}
        </p>
      </article>
      <AppliedFiltersAside filters={effectiveFilters} sampleSize={selectedCount} lastSync={lastSync} />
    </section>

    <section aria-label="Eventos recientes y estado de conexión" className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-border-ui bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-main">Últimos reportes del IGP</h2>
          <button type="button" onClick={() => { igpLatest.refresh(); igpRecent.refresh(); }} disabled={igpLatest.loading || igpRecent.loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-ui px-2.5 py-1.5 text-xs text-main hover:bg-panel-alt disabled:opacity-50">
            <RefreshCw size={13}/> Actualizar
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">Muestra en vivo; no se suma a los indicadores del catálogo.
          {lastEvent && <> Último sismo publicado: M {lastEvent.magnitude?.toFixed(1) ?? '—'} ({peruDate(lastEvent.occurred_at, true)}).</>}
        </p>
        {igpRecent.loading && !igpRecent.data && <LoadingSpinner variant="inline" label="Consultando reportes recientes…" className="mt-5 text-muted" />}
        {igpRecent.data?.items.length ? <ul className="mt-3 divide-y divide-border-ui">
          {igpRecent.data.items.slice(0, 3).map(item => <li key={item.external_id}>
            {/* Navegación por ID oficial: Mapa localiza el epicentro y abre su popup. */}
            <Link to={`/mapa-sismico?igp_event=${encodeURIComponent(item.external_id)}`} state={{ igpReport: item }}
              aria-label={`Ver epicentro y detalles del sismo ${item.external_id} en Mapa sísmico`}
              className="group flex items-start justify-between gap-4 rounded-lg py-3 text-sm transition-colors hover:bg-panel-alt focus-visible:outline-2 focus-visible:outline-accent">
              <div className="min-w-0"><p className="font-medium text-main group-hover:text-accent">{item.place ?? 'Ubicación no publicada'}</p><p className="mt-0.5 text-xs text-muted">{peruDate(item.occurred_at, true)} · Prof. {item.depth_km == null ? '—' : `${item.depth_km.toFixed(1)} km`}</p><p className="mt-1 text-xs font-semibold text-accent">Ver en mapa y detalles →</p></div>
              <span className="shrink-0 rounded-lg bg-panel-alt px-2 py-1 font-semibold text-main">M {item.magnitude?.toFixed(1) ?? '—'}</span>
            </Link>
          </li>)}
        </ul> : !igpRecent.loading && <p className="mt-5 text-sm text-muted">Sin reportes disponibles en esta consulta.</p>}
        <a href={IGP_OFFICIAL_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">Consultar fuente oficial <ArrowUpRight size={13}/></a>
      </article>

      <article className="rounded-2xl border border-border-ui bg-panel p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-semibold text-main"><Database size={16} className="text-accent"/> Estado de conectores IGP</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div><dt className="text-xs text-muted">Última ingesta correcta</dt><dd className="mt-1 font-medium text-main">{lastSync ? peruDate(lastSync, true) : 'No disponible'}</dd></div>
          <div><dt className="text-xs text-muted">Estado de conector</dt><dd className="mt-1 font-medium text-main">{operations?.connector_status ?? sources[0]?.status ?? 'No disponible'}</dd></div>
          <div><dt className="text-xs text-muted">Magnitudes informadas</dt><dd className="mt-1 font-medium text-main">{coverage(summary?.with_magnitude, summary?.total)}</dd></div>
          <div><dt className="text-xs text-muted">Profundidades informadas</dt><dd className="mt-1 font-medium text-main">{coverage(summary?.with_depth, summary?.total)}</dd></div>
          <div><dt className="text-xs text-muted">Estado de la última ejecución</dt><dd className="mt-1 font-medium text-main">{lastRun?.status ?? 'No disponible'}</dd></div>
          <div><dt className="text-xs text-muted">Evento → recepción en BD</dt><dd className="mt-1 font-medium text-main">{operations?.latest_event_ingestion_lag_minutes == null ? 'No disponible' : `${operations.latest_event_ingestion_lag_minutes.toLocaleString('es-PE')} min`}</dd></div>
          <div><dt className="text-xs text-muted">Duración de la última ingesta</dt><dd className="mt-1 font-medium text-main">{runDuration != null && Number.isFinite(runDuration) && runDuration >= 0 ? `${runDuration.toFixed(1)} s` : 'No disponible'}</dd></div>
          <div><dt className="text-xs text-muted">Registros examinados en última ingesta</dt><dd className="mt-1 font-medium text-main">{lastRun?.records_seen?.toLocaleString('es-PE') ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted">Reglas informativas habilitadas</dt><dd className="mt-1 font-medium text-main">{operations?.enabled_rules ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted">Capa Último Sismo · consultada</dt><dd className="mt-1 text-main">{igpLatest.data ? peruDate(igpLatest.data.fetched_at, true) : '—'}</dd></div>
          <div><dt className="text-xs text-muted">Capa Sismos Reportados · consultada</dt><dd className="mt-1 text-main">{igpRecent.data ? peruDate(igpRecent.data.fetched_at, true) : '—'}</dd></div>
        </dl>
        {warning && <p role="status" className="mt-3 rounded-lg bg-panel-alt p-3 text-xs text-main">{warning}</p>}
        {operationsError && <p role="status" className="mt-3 text-xs text-muted">No fue posible verificar el estado de avisos o la última ingesta.</p>}
        <p className="mt-3 border-t border-border-ui pt-3 text-xs text-soft">La demora evento→BD puede incluir conciliaciones de registros antiguos; no mide la latencia propia del IGP. La duración corresponde al proceso de ingesta. Los avisos son posteriores al evento.</p>
      </article>
    </section>
  </div>;
}
