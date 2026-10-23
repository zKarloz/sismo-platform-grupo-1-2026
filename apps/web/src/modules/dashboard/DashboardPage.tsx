/** Dashboard Fase 4: KPIs y gráficos provenientes de agregaciones SQL reales. */
import { useEffect, useState } from 'react';
import { Activity, Clock3, Database, Layers3, Ruler, Waves } from 'lucide-react';
import StatCard from '../../components/StatCard';
import FilterBar from '../../components/analytics/FilterBar';
import { MagnitudesChart, SeriesChart } from '../../components/analytics/Charts';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { getMagnitudes, getSummary, getTimeSeries } from '../../services/analytics';
import { getSources } from '../../services/seismic';
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
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pueden obtener los indicadores');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, revision]);

  const recent = summary?.latest_event_at
    ? new Date(summary.latest_event_at).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }) : '—';
  const lastSync = sources.map(item => item.last_success_at).filter((x): x is string => Boolean(x)).sort().at(-1);

  return <div className="space-y-6">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Fase 4 · Indicadores observados</p>
      <h1 className="mt-2 text-3xl font-bold text-main">Dashboard sísmico</h1>
      <p className="mt-2 text-sm text-muted">Métricas sobre eventos ya sincronizados con Supabase. No representan una predicción ni un nivel de peligro.</p>
    </div>
    <FilterBar />
    {error && <p role="alert" className="rounded-lg border border-rose-400 p-4 text-sm text-rose-600 dark:text-rose-300">{error}. Comprueba FastAPI y la conexión a Supabase.</p>}
    <section aria-label="Indicadores del catálogo filtrado" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Eventos registrados" value={loading || !summary ? '—' : String(summary.total)} detail="Total filtrado en PostgreSQL" icon={Activity}/>
      <StatCard label="Magnitud máxima" value={summary?.max_magnitude == null || loading ? '—' : summary.max_magnitude.toFixed(1)} detail="Valor máximo observado en el filtro" icon={Waves}/>
      <StatCard label="Profundidad promedio" value={summary?.avg_depth_km == null || loading ? '—' : `${summary.avg_depth_km.toFixed(1)} km`} detail={`${summary?.with_depth ?? '—'} registros con profundidad`} icon={Ruler}/>
      <StatCard label="Último evento" value={loading ? '—' : recent} detail="Fecha/hora de Perú (UTC−5)" icon={Clock3}/>
    </section>
    <section className="grid gap-5 xl:grid-cols-2">
      <article className="min-w-0 rounded-2xl border border-border-ui bg-panel p-5 shadow-sm">
        <h2 className="font-semibold text-main">Eventos en el tiempo</h2>
        <p className="mt-1 mb-4 text-xs text-muted">Días con registros en UTC · {series?.total ?? '—'} eventos (fechas sin registros omitidas)</p>
        {loading ? <p className="p-8 text-sm text-muted">Calculando serie...</p> : <SeriesChart data={series}/>}
      </article>
      <article className="min-w-0 rounded-2xl border border-border-ui bg-panel p-5 shadow-sm">
        <h2 className="font-semibold text-main">Distribución por magnitud</h2>
        <p className="mt-1 mb-4 text-xs text-muted">Conteo según magnitud reportada, sin escala de alerta</p>
        {loading ? <p className="p-8 text-sm text-muted">Calculando distribución...</p> : <MagnitudesChart data={magnitudes}/>}
      </article>
    </section>
    <section className="rounded-2xl border border-border-ui bg-panel p-5">
      <h2 className="flex items-center gap-2 font-semibold text-main"><Database size={17} className="text-accent"/> Estado de los datos</h2>
      <div className="mt-4 grid gap-4 text-sm text-muted sm:grid-cols-3">
        <p className="flex items-center gap-2"><Layers3 size={16}/> Fuentes registradas: <strong className="text-main">{sources.length}</strong></p>
        <p>Última sincronización correcta: <strong className="text-main">{lastSync ? new Date(lastSync).toLocaleString('es-PE', {timeZone:'America/Lima'}) : '—'}</strong></p>
        <p>Magnitudes informadas: <strong className="text-main">{summary?.with_magnitude ?? '—'} / {summary?.total ?? '—'}</strong></p>
      </div>
      <p className="mt-3 text-xs text-soft">Los filtros afectan a todos los indicadores. El catálogo sincronizado no equivale al historial completo de sismos en Perú.</p>
    </section>
  </div>;
}
