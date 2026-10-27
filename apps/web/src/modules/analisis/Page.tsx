/** Análisis estadístico de eventos persistidos; sin predicción de actividad futura. */
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useEffect, useState } from 'react';
import { BarChart3, ScatterChart as ScatterIcon } from 'lucide-react';
import FilterBar from '../../components/analytics/FilterBar';
import { DepthScatterChart, MagnitudesChart, SeriesChart } from '../../components/analytics/Charts';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { getMagnitudes, getScatter, getTimeSeries } from '../../services/analytics';
import type { MagnitudeDistribution, ScatterDataset, TimeSeries } from '../../types/analytics';

export default function Page() {
  const { filters, revision } = useAnalyticsFilters();
  const [series, setSeries] = useState<TimeSeries | null>(null);
  const [histogram, setHistogram] = useState<MagnitudeDistribution | null>(null);
  const [scatter, setScatter] = useState<ScatterDataset | null>(null);
  const [interval, setInterval] = useState<'day' | 'month'>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([getTimeSeries(filters, interval, controller.signal), getMagnitudes(filters, controller.signal), getScatter(filters, controller.signal)])
      .then(([t, m, s]) => { if (!controller.signal.aborted) { setSeries(t); setHistogram(m); setScatter(s); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Error de analítica'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, revision, interval]);

  return <div className="space-y-6">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Fase 4 · Estadística histórica</p>
      <h1 className="mt-2 text-3xl font-bold text-main">Análisis de sismos</h1>
      <p className="mt-2 text-sm text-muted">Distribuciones descriptivas de eventos registrados; no permiten pronosticar cuándo o dónde ocurrirá un terremoto.</p>
    </div>
    <FilterBar />
    {error && <p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-border-ui bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-main"><BarChart3 size={17} className="text-accent"/> Frecuencia temporal</h2>
          <label className="text-xs text-muted">Agrupar por: <select className="ml-1 rounded-lg border border-border-ui bg-page px-2 py-1 text-main" value={interval} onChange={e => setInterval(e.target.value as 'day'|'month')}><option value="day">Día (UTC)</option><option value="month">Mes (UTC)</option></select></label>
        </div>
        <p className="my-3 text-xs text-muted">{series?.total ?? '—'} eventos en el filtro actual · intervalos sin registros omitidos</p>
        {loading ? <LoadingSpinner label="Calculando serie temporal…" /> : <SeriesChart data={series}/>}
      </section>
      <section className="rounded-2xl border border-border-ui bg-panel p-5">
        <h2 className="font-semibold text-main">Histograma de magnitudes</h2>
        <p className="my-3 text-xs text-muted">El tipo de magnitud puede variar entre fuentes y eventos</p>
        {loading ? <LoadingSpinner label="Calculando magnitudes…" /> : <MagnitudesChart data={histogram}/>}
      </section>
    </div>
    <section className="rounded-2xl border border-border-ui bg-panel p-5">
      <h2 className="flex items-center gap-2 font-semibold text-main"><ScatterIcon size={17} className="text-accent"/> Magnitud frente a profundidad</h2>
      <p className="mt-2 text-xs text-muted">Eje X: profundidad (km) · Eje Y: magnitud reportada. Cada punto es un sismo con ambas medidas.</p>
      {scatter?.truncated && <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Mostrando solo los {scatter.returned} registros más recientes de {scatter.total} válidos; muestra no representativa.</p>}
      <div className="mt-4">{loading ? <LoadingSpinner label="Calculando profundidad…" /> : <DepthScatterChart data={scatter}/>}</div>
      <p className="mt-2 text-xs text-soft">Tamaño de muestra: {scatter?.returned ?? '—'} | Datos disponibles con ambas medidas: {scatter?.total ?? '—'}. Correlación visual no implica causalidad.</p>
    </section>
  </div>;
}
