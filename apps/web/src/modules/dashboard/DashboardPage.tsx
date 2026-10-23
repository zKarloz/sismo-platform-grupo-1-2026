/** Dashboard: monitoreo IGP (consulta reciente) separado del catálogo histórico USGS.
 * Nunca se suman registros de ambas fuentes: un mismo sismo puede aparecer en las dos.
 */
import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Clock3, Database, Layers3, MapPinned, RefreshCw, Ruler, Waves } from 'lucide-react';
import StatCard from '../../components/StatCard';
import FilterBar from '../../components/analytics/FilterBar';
import { MagnitudesChart, SeriesChart } from '../../components/analytics/Charts';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { useIGPFeed } from '../../hooks/useIGPFeed';
import { getMagnitudes, getSummary, getTimeSeries } from '../../services/analytics';
import { getSources } from '../../services/seismic';
import { IGP_OFFICIAL_URL, igpFreshnessWarning, peruDate } from '../../services/igp';
import type { Summary, MagnitudeDistribution, TimeSeries } from '../../types/analytics';
import type { DataSource } from '../../types/seismic';

export default function DashboardPage() {
  const { filters, revision } = useAnalyticsFilters();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<TimeSeries | null>(null);
  const [magnitudes, setMagnitudes] = useState<MagnitudeDistribution | null>(null);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Fuentes IGP independientes: Último Sismo y Sismos Reportados pueden actualizarse a distinto ritmo.
  const igpLatest = useIGPFeed('latest');
  const igpRecent = useIGPFeed('recent');
  const lastIGP = igpLatest.data?.items[0] ?? null;
  const warning = igpLatest.data ? igpFreshnessWarning(igpLatest.data) : null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([
      getSummary(filters, controller.signal),
      getTimeSeries(filters, 'day', controller.signal),
      getMagnitudes(filters, controller.signal),
      getSources(controller.signal),
    ]).then(([s, t, m, src]) => {
      if (controller.signal.aborted) return;
      setSummary(s); setSeries(t); setMagnitudes(m); setSources(src.items);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pueden obtener los indicadores históricos');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, revision]);

  const recentStored = summary?.latest_event_at ? peruDate(summary.latest_event_at) : '—';
  const lastSync = sources.map(item => item.last_success_at).filter((x): x is string => Boolean(x)).sort().at(-1);

  return <div className="space-y-6">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Monitoreo nacional · Datos observados</p>
      <h1 className="mt-2 text-3xl font-bold text-main">Dashboard sísmico</h1>
      <p className="mt-2 text-sm text-muted">IGP/CENSIS para reportes recientes de Perú; catálogo sincronizado en Supabase para el análisis histórico. No son predicciones ni alertas tempranas.</p>
    </div>

    <section aria-label="Monitoreo nacional IGP" className="space-y-4 rounded-2xl border border-border-ui bg-panel p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-main"><MapPinned size={18} className="text-accent"/> IGP/CENSIS · Monitoreo nacional</h2>
          <p className="mt-1 text-xs text-muted">Último sismo de la capa oficial «Último Sismo». Refresco cada 5 minutos mientras la vista esté abierta.</p>
        </div>
        <button type="button" onClick={() => { igpLatest.refresh(); igpRecent.refresh(); }}
          disabled={igpLatest.loading || igpRecent.loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt disabled:opacity-50">
          <RefreshCw size={15} aria-hidden="true"/> Consultar IGP
        </button>
      </div>
      {(igpLatest.error || igpRecent.error) && <p role="alert" className="rounded-lg border border-border-ui bg-panel-alt p-3 text-sm text-main">
        {igpLatest.error && `Último sismo: ${igpLatest.error}. `}
        {igpRecent.error && `Reportes recientes: ${igpRecent.error}.`}
      </p>}
      {igpLatest.loading && !igpLatest.data && <p role="status" className="text-sm text-muted">Consultando último sismo IGP…</p>}
      {lastIGP ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Última magnitud IGP" value={lastIGP.magnitude?.toFixed(1) ?? '—'} detail="Magnitud reportada; no indica nivel de peligro" icon={Waves}/>
        <StatCard label="Hora del último IGP" value={new Date(lastIGP.occurred_at).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour12: false })} detail={`Fecha: ${new Date(lastIGP.occurred_at).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })} (Perú)`} icon={Clock3}/>
        <StatCard label="Profundidad IGP" value={lastIGP.depth_km === null ? '—' : `${lastIGP.depth_km.toFixed(1)} km`} detail="Último evento de la capa oficial" icon={Ruler}/>
        <StatCard label="Reportes visibles IGP" value={igpRecent.data ? String(igpRecent.data.items.length) : '—'} detail="Solo muestra reciente; no es el total nacional" icon={Activity}/>
      </div> : !igpLatest.loading && <p className="text-sm text-muted">La capa «Último Sismo» no devolvió un registro disponible.</p>}
      {lastIGP && <p className="rounded-lg bg-panel-alt p-3 text-sm text-main"><strong>Referencia del último sismo:</strong> {lastIGP.place ?? 'Sin referencia geográfica'}</p>}
      {warning && <p role="status" className="rounded-lg border border-border-ui p-3 text-sm text-main">{warning}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border-ui p-3 text-xs text-muted">
          <strong className="text-main">Capa «Último Sismo»</strong>
          <p className="mt-1">Consultada: {igpLatest.data ? peruDate(igpLatest.data.fetched_at, true) : '—'}</p>
          <p>Ocurrencia reportada: {igpLatest.data?.latest_event_at ? peruDate(igpLatest.data.latest_event_at, true) : '—'}</p>
        </div>
        <div className="rounded-lg border border-border-ui p-3 text-xs text-muted">
          <strong className="text-main">Capa «Sismos Reportados»</strong>
          <p className="mt-1">Consultada: {igpRecent.data ? peruDate(igpRecent.data.fetched_at, true) : '—'}</p>
          <p>Último en listado: {igpRecent.data?.latest_event_at ? peruDate(igpRecent.data.latest_event_at, true) : '—'}</p>
        </div>
      </div>
      {igpRecent.data && igpRecent.data.items.length > 0 && <div>
        <h3 className="mb-2 text-sm font-semibold text-main">Últimos reportes publicados (muestra IGP)</h3>
        <div className="overflow-x-auto rounded-lg border border-border-ui">
          <table className="w-full min-w-[550px] text-left text-sm">
            <thead className="bg-panel-alt text-xs text-muted"><tr><th className="p-3">Fecha (Perú)</th><th className="p-3">Magnitud</th><th className="p-3">Ubicación</th></tr></thead>
            <tbody className="divide-y divide-border-ui">
              {igpRecent.data.items.slice(0, 5).map(item => <tr key={item.external_id}>
                <td className="whitespace-nowrap p-3 text-main">{peruDate(item.occurred_at, true)}</td>
                <td className="p-3 font-medium text-main">{item.magnitude?.toFixed(1) ?? '—'}</td>
                <td className="p-3 text-muted">{item.place ?? 'Sin referencia'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
      <div className="flex flex-wrap justify-between gap-2 text-xs text-soft">
        <span>Las dos capas pueden actualizarse en momentos distintos. Sus reportes también pueden estar sincronizados en Supabase; evita sumar proveedores sin conciliación.</span>
        <a href={IGP_OFFICIAL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">Ver reportes IGP <ArrowUpRight size={14}/></a>
      </div>
    </section>

    <section aria-label="Analítica del catálogo sincronizado" className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-main">Catálogo histórico sincronizado · Supabase</h2>
        <p className="mt-1 text-sm text-muted">Estos indicadores se calculan sobre los registros guardados. Por defecto se filtra USGS; puedes elegir IGP. La opción Todas puede contabilizar dos reportes del mismo sismo. Los filtros no afectan las tarjetas recientes IGP.</p>
      </div>
      <FilterBar />
      {error && <p role="alert" className="rounded-lg border border-rose-400 p-4 text-sm text-rose-600 dark:text-rose-300">{error}. Comprueba FastAPI y la conexión a Supabase.</p>}
      <section aria-label="Indicadores del catálogo filtrado" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Eventos almacenados" value={loading || !summary ? '—' : String(summary.total)} detail="Total filtrado en PostgreSQL (registros por proveedor)" icon={Activity}/>
        <StatCard label="Magnitud máxima" value={summary?.max_magnitude == null || loading ? '—' : summary.max_magnitude.toFixed(1)} detail="Máxima en el catálogo filtrado" icon={Waves}/>
        <StatCard label="Profundidad promedio" value={summary?.avg_depth_km == null || loading ? '—' : `${summary.avg_depth_km.toFixed(1)} km`} detail={`${summary?.with_depth ?? '—'} registros con profundidad`} icon={Ruler}/>
        <StatCard label="Último en Supabase" value={loading ? '—' : recentStored} detail="Ocurrencia en hora peruana; puede no coincidir con IGP" icon={Clock3}/>
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        <article className="min-w-0 rounded-2xl border border-border-ui bg-panel p-5 shadow-sm">
          <h3 className="font-semibold text-main">Eventos almacenados en el tiempo</h3>
          <p className="mt-1 mb-4 text-xs text-muted">Días UTC · {series?.total ?? '—'} registros (días sin registros omitidos)</p>
          {loading ? <p className="p-8 text-sm text-muted">Calculando serie…</p> : <SeriesChart data={series}/>}
        </article>
        <article className="min-w-0 rounded-2xl border border-border-ui bg-panel p-5 shadow-sm">
          <h3 className="font-semibold text-main">Distribución por magnitud · catálogo</h3>
          <p className="mt-1 mb-4 text-xs text-muted">Conteo de magnitudes reportadas, sin escala de alerta</p>
          {loading ? <p className="p-8 text-sm text-muted">Calculando distribución…</p> : <MagnitudesChart data={magnitudes}/>}
        </article>
      </section>
      <section className="rounded-2xl border border-border-ui bg-panel p-5">
        <h3 className="flex items-center gap-2 font-semibold text-main"><Database size={17} className="text-accent"/> Estado del catálogo almacenado</h3>
        <div className="mt-4 grid gap-4 text-sm text-muted sm:grid-cols-3">
          <p className="flex items-center gap-2"><Layers3 size={16}/> Fuentes registradas: <strong className="text-main">{sources.length}</strong></p>
          <p>Última sincronización correcta: <strong className="text-main">{lastSync ? peruDate(lastSync, true) : '—'}</strong></p>
          <p>Magnitudes informadas: <strong className="text-main">{summary?.with_magnitude ?? '—'} / {summary?.total ?? '—'}</strong></p>
        </div>
        <p className="mt-3 text-xs text-soft">Este histórico puede incluir países vecinos por la zona de búsqueda USGS; no equivale al catálogo nacional IGP.</p>
      </section>
    </section>
  </div>;
}
