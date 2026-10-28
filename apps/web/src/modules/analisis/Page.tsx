/** Análisis descriptivo IGP/CENSIS: un gráfico activo y filtros visibles.
 * Los gráficos y el CSV consultan eventos persistidos, no pronósticos.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AppliedFiltersAside from '../../components/analytics/AppliedFiltersAside';
import ChartSwitcher from '../../components/analytics/ChartSwitcher';
import { PERU_DEPARTMENTS } from '../../lib/peruDepartments';
import { withCurrentPeruMonth } from '../../lib/peruMonth';
import FilterBar from '../../components/analytics/FilterBar';
import { DepthScatterChart, MagnitudesChart, SeriesChart } from '../../components/analytics/Charts';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { getMagnitudes, getScatter, getSummary, getTimeSeries } from '../../services/analytics';
import type { MagnitudeDistribution, ScatterDataset, Summary, TimeSeries } from '../../types/analytics';

// El selector reutilizable garantiza que solo se muestre un gráfico a la vez.
type ChartId = 'timeseries' | 'magnitudes' | 'scatter';
const choices: { id: ChartId; label: string }[] = [
  { id: 'timeseries', label: 'Serie temporal' },
  { id: 'magnitudes', label: 'Histograma de magnitudes' },
  { id: 'scatter', label: 'Magnitud y profundidad' },
];

export default function Page() {
  const { filters, revision } = useAnalyticsFilters();
  // El departamento afecta solo a este módulo: no modificar los filtros
  // compartidos del Dashboard ni confundir texto reportado con polígonos.
  const [reportedDepartment, setReportedDepartment] = useState('');
  const departmentName = PERU_DEPARTMENTS.find(([code]) => code === reportedDepartment)?.[1];
  // Nunca confiar en una fuente anterior conservada en el contexto compartido.
  // Misma política temporal que Dashboard: sin fechas explícitas, todos los
  // gráficos y el panel lateral consultan el mes civil actual de Perú.
  const igpFilters = useMemo(() => ({ ...withCurrentPeruMonth(filters), source: 'IGP/CENSIS',
    ...(reportedDepartment ? { reported_department: reportedDepartment } : {}),
  }), [filters, reportedDepartment]);
  const [chart, setChart] = useState<ChartId>('timeseries');
  // Agrupación diaria: un mes predeterminado produce una serie útil, no un punto.
  const [interval, setInterval] = useState<'day' | 'month'>('day');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<TimeSeries | null>(null);
  const [histogram, setHistogram] = useState<MagnitudeDistribution | null>(null);
  const [scatter, setScatter] = useState<ScatterDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [executedAt, setExecutedAt] = useState<string | null>(null);

  // El resumen se calcula sobre el conjunto completo filtrado (sin límite de puntos).
  useEffect(() => {
    const controller = new AbortController();
    setSummary(null);
    setSummaryLoading(true);
    setSummaryError('');
    getSummary(igpFilters, controller.signal)
      .then(data => { if (!controller.signal.aborted) setSummary(data); })
      .catch(() => { if (!controller.signal.aborted) setSummaryError('No fue posible calcular la integridad de los datos.'); })
      .finally(() => { if (!controller.signal.aborted) setSummaryLoading(false); });
    return () => controller.abort();
  }, [igpFilters, revision]);

  // Solo consultar el gráfico seleccionado. AbortController descarta respuestas obsoletas
  // cuando se cambia el gráfico, agrupación o filtros antes de finalizar la petición.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setExecutedAt(null);
    setSeries(null);
    setHistogram(null);
    setScatter(null);
    const request = chart === 'timeseries'
      ? getTimeSeries(igpFilters, interval, controller.signal).then(value => { if (!controller.signal.aborted) setSeries(value); })
      : chart === 'magnitudes'
        ? getMagnitudes(igpFilters, controller.signal).then(value => { if (!controller.signal.aborted) setHistogram(value); })
        : getScatter(igpFilters, controller.signal).then(value => { if (!controller.signal.aborted) setScatter(value); });
    request
      .then(() => { if (!controller.signal.aborted) setExecutedAt(new Date().toISOString()); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudieron consultar los eventos IGP.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [igpFilters, revision, chart, interval]);

  const sampleSize = chart === 'timeseries' ? series?.total
    : chart === 'magnitudes' ? histogram?.total : scatter?.returned;
  // Las magnitudes ausentes se cuentan en el histograma «Sin dato». Para la
  // dispersión se excluyen filas sin cualquiera de las dos medidas.
  const missingCount = !summary ? undefined : chart === 'magnitudes'
    ? summary.total - summary.with_magnitude
    : chart === 'scatter' && scatter ? summary.total - scatter.total : 0;
  const sampleNote = chart === 'scatter'
    ? `Con ambas medidas: ${scatter?.total.toLocaleString('es-PE') ?? '—'}${scatter?.truncated ? '. Gráfico limitado a los 500 registros más recientes; no representa toda la muestra.' : '.'}`
    : chart === 'magnitudes' ? 'La categoría «Sin dato» se incluye en el histograma.'
      : 'Conteo de eventos por intervalo UTC; períodos vacíos omitidos.';

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-main">Análisis histórico</h1>
        <p className="mt-1 text-sm text-muted">Estadísticas descriptivas de sismos IGP/CENSIS almacenados. No predicen futuros eventos.</p>
      </div>
      {/* FilterBar ya usa Modal.tsx para los filtros y exporta CSV con la fuente IGP fija. */}
      <FilterBar currentMonthDefault monthPicker reportedDepartmentSelection={{ value: reportedDepartment, onChange: setReportedDepartment }} />
    </header>

    {error && <p role="alert" className="rounded-xl border border-rose-400 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}. Comprueba FastAPI y la fuente IGP/CENSIS.</p>}
    {summaryError && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{summaryError}</p>}

    <section aria-label="Gráfico estadístico y filtros aplicados" className="flex flex-col gap-4 xl:flex-row">
      <article className="min-w-0 flex-1 rounded-2xl border border-border-ui bg-panel p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-main"><ChartNoAxesCombined size={17} className="text-accent"/> Visualización estadística IGP</h2>
            <p className="mt-1 text-xs text-muted">Fuente IGP/CENSIS · Conjunto: eventos sincronizados en PostgreSQL</p>
          </div>
          <ChartSwitcher choices={choices} value={chart} onChange={setChart} />
        </div>

        {chart === 'timeseries' && <div className="mt-4 flex justify-end">
          <label className="flex items-center gap-2 text-xs text-muted">Agrupación temporal
            <select value={interval} onChange={event => setInterval(event.target.value as 'day' | 'month')}
              className="rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main">
              <option value="day">Día (UTC)</option>
              <option value="month">Mes (UTC)</option>
            </select>
          </label>
        </div>}

        <div className="mt-5" aria-live="polite">
          {loading ? <LoadingSpinner label="Calculando gráfico IGP…" className="h-72" />
            : chart === 'timeseries' ? <SeriesChart data={series} />
              : chart === 'magnitudes' ? <MagnitudesChart data={histogram} />
                : <DepthScatterChart data={scatter} />}
        </div>

        {chart === 'scatter' && scatter?.truncated && <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          El diagrama muestra {scatter.returned.toLocaleString('es-PE')} de {scatter.total.toLocaleString('es-PE')} eventos con ambas medidas, seleccionados entre los más recientes.
        </p>}
        <p className="mt-3 text-xs text-soft">{chart === 'scatter'
          ? 'Eje X: profundidad (km) · Eje Y: magnitud. La correlación visual no implica causalidad.'
          : chart === 'timeseries'
            ? 'Frecuencia de eventos por período UTC; los períodos sin registros pueden omitirse.'
            : 'Distribución de magnitudes reportadas; no representa una escala de peligrosidad.'}</p>
      </article>

      {/* Componente compartido con Dashboard: mismo ancho, colores y filtros. */}
      <AppliedFiltersAside filters={igpFilters} geoDescription={departmentName ? `${departmentName} (etiqueta del reporte IGP; no límite geográfico)` : undefined} sampleSize={loading ? null : sampleSize}
        populationSize={summaryLoading ? null : summary?.total}
        missingCount={loading || summaryLoading ? null : missingCount}
        sampleNote={loading ? undefined : sampleNote}
        executedAt={executedAt} showLastSync={false} />
    </section>

    <p className="text-xs text-muted">El departamento se filtra únicamente cuando el IGP lo indica explícitamente al final de la ubicación (por ejemplo «- Arequipa»). No equivale a los límites administrativos del epicentro; los reportes sin esa etiqueta se excluyen. El CSV exporta eventos del conjunto filtrado, no datos calculados de los gráficos.</p>
  </div>;
}
