/** Calidad y datasets observados; escritura restringida a CLI hasta tener RBAC. */
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useEffect, useState } from 'react';
import { CheckCircle2, Database, FileCheck2, RefreshCw, ShieldAlert } from 'lucide-react';
import FilterBar from '../../components/analytics/FilterBar';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { getDatasets, getQuality } from '../../services/quality';
import type { DatasetList, QualityReport } from '../../types/quality';

const labels: Record<string, string> = {
  magnitude: 'Magnitud', depth_km: 'Profundidad', magnitude_type: 'Tipo de magnitud',
  place: 'Localidad', source_updated_at: 'Actualización de origen',
};
const fmt = (stamp: string | null) => stamp ? new Date(stamp).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '—';

export default function Page() {
  const { filters, revision } = useAnalyticsFilters();
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [datasets, setDatasets] = useState<DatasetList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([getQuality(filters, controller.signal), getDatasets(controller.signal)])
      .then(([q, ds]) => { if (!controller.signal.aborted) { setQuality(q); setDatasets(ds); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Error de calidad'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, revision, refresh]);

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Fase 5 · Calidad y reproducibilidad</p>
        <h1 className="mt-2 text-3xl font-bold text-main">Calidad y datasets</h1>
        <p className="mt-2 text-sm text-muted">Completitud, coherencia y versiones congeladas de sismos registrados. Sin pronósticos.</p>
      </div>
      <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-border-ui bg-panel px-4 py-2 text-sm text-main hover:bg-panel-alt" onClick={() => setRefresh(x => x + 1)}>
        <RefreshCw size={16}/> Actualizar
      </button>
    </header>
    <FilterBar />
    {error && <p role="alert" className="rounded-xl border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">{error}. Si falta la tabla datasets, ejecuta la migración 002 en Supabase.</p>}
    {loading && <div className="rounded-xl border border-border-ui bg-panel"><LoadingSpinner label="Calculando indicadores de calidad…" /></div>}
    {!loading && quality && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Eventos analizados', quality.total],
          ['Magnitud y profundidad completas', quality.complete_magnitude_depth],
          ['Duplicados dentro de fuente', quality.duplicates_within_source],
          ['Registros incoherentes', quality.out_of_range_or_invalid + quality.future_events],
        ].map(([name, value]) => <section key={name} className="rounded-2xl border border-border-ui bg-panel p-5">
          <p className="text-xs font-semibold text-muted">{name}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-main">{value}</p>
        </section>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-border-ui bg-panel p-5">
          <h2 className="flex items-center gap-2 font-semibold text-main">{quality.status === 'review' ? <ShieldAlert className="text-amber-600" size={18}/> : <CheckCircle2 className="text-accent" size={18}/>} Informe de integridad</h2>
          <p className="mt-2 text-sm text-muted">Estado: <strong className="text-main">{quality.status === 'review' ? 'Requiere revisión' : quality.status === 'missing_values' ? 'Con campos incompletos' : 'Sin hallazgos técnicos'}</strong></p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Fechas futuras (tolerancia de 5 min)</dt><dd className="font-medium text-main">{quality.future_events}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Rangos técnicos inválidos</dt><dd className="font-medium text-main">{quality.out_of_range_or_invalid}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Primer evento</dt><dd className="text-main">{fmt(quality.min_occurred_at)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Último evento</dt><dd className="text-main">{fmt(quality.max_occurred_at)}</dd></div>
          </dl>
          <p className="mt-5 text-xs text-soft">{quality.method} El análisis representa solo los eventos sincronizados y filtrados.</p>
        </section>
        <section className="rounded-2xl border border-border-ui bg-panel p-5">
          <h2 className="font-semibold text-main">Campos faltantes</h2>
          <p className="mt-1 text-xs text-muted">Los datos ausentes se reportan, no se completan artificialmente.</p>
          <div className="mt-5 space-y-4">{Object.entries(quality.missing).map(([field, count]) => <div key={field}>
            <div className="mb-1 flex justify-between gap-2 text-xs"><span className="text-muted">{labels[field] ?? field}</span><span className="tabular-nums text-main">{count} / {quality.total}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-panel-alt"><div className="h-full rounded-full bg-accent" style={{ width: `${quality.total ? 100 * count / quality.total : 0}%` }}/></div>
          </div>)}</div>
        </section>
      </div>
      <section className="rounded-2xl border border-border-ui bg-panel p-5">
        <h2 className="font-semibold text-main">Procedencia del conjunto filtrado</h2>
        <div className="mt-3 flex flex-wrap gap-3">{Object.entries(quality.by_source).length === 0 ? <p className="text-sm text-muted">Sin eventos en el filtro seleccionado.</p> : Object.entries(quality.by_source).map(([name, count]) => <div key={name} className="rounded-xl bg-panel-alt px-4 py-3 text-sm text-main"><strong>{name}</strong> · {count} eventos</div>)}</div>
      </section>
    </>}
    <section className="rounded-2xl border border-border-ui bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-semibold text-main"><Database size={18} className="text-accent"/> Datasets versionados</h2>
        <p className="mt-1 text-xs text-muted">Snapshots históricos inmutables. La lista es global; los filtros de arriba solo afectan al informe de eventos.</p></div>
        <span className="rounded-full bg-panel-alt px-3 py-1 text-xs text-main">{datasets?.total ?? 0} versiones</span>
      </div>
      {!loading && datasets?.items.length === 0 && <div className="mt-5 rounded-xl border border-dashed border-border-ui p-5 text-sm text-muted">Todavía no hay datasets. Crea el primero desde Git Bash siguiendo docs/FASE_5.md.</div>}
      <div className="mt-4 space-y-3">{datasets?.items.map(dataset => <article key={dataset.id} className="rounded-xl border border-border-ui bg-page p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold text-main"><FileCheck2 size={16} className="text-accent"/> {dataset.name} · v{dataset.version}</h3>
        <p className="mt-1 text-xs text-muted">{dataset.row_count} registros · creado {fmt(dataset.created_at)} · calidad: {dataset.quality_report.status}</p></div>
        <span className="rounded-lg bg-panel-alt px-2 py-1 text-xs text-muted">Inmutable</span></div>
        <p className="mt-3 break-all font-mono text-[11px] text-soft" title={dataset.content_sha256}>SHA-256: {dataset.content_sha256}</p>
      </article>)}</div>
    </section>
  </div>;
}
