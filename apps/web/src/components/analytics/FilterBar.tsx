/** Barra de filtros común. Los campos de fecha representan días completos en UTC. */
import { useEffect, useState, type FormEvent } from 'react';
import { Download, Filter, RotateCcw, RefreshCw } from 'lucide-react';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { getSources } from '../../services/seismic';
import { downloadEventsCsv } from '../../services/analytics';
import type { DataSource } from '../../types/seismic';

const fieldClass = 'w-full rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main focus:outline-accent';

export default function FilterBar() {
  const { filters, setFilters, refresh } = useAnalyticsFilters();
  const [start, setStart] = useState(filters.start_time?.slice(0, 10) ?? '');
  const [end, setEnd] = useState(filters.end_time?.slice(0, 10) ?? '');
  const [minimum, setMinimum] = useState(filters.min_magnitude === undefined ? '' : String(filters.min_magnitude));
  const [maximum, setMaximum] = useState(filters.max_magnitude === undefined ? '' : String(filters.max_magnitude));
  const [minimumDepth, setMinimumDepth] = useState(filters.min_depth === undefined ? '' : String(filters.min_depth));
  const [maximumDepth, setMaximumDepth] = useState(filters.max_depth === undefined ? '' : String(filters.max_depth));
  const [source, setSource] = useState(filters.source ?? '');
  const [sources, setSources] = useState<DataSource[]>([]);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getSources(controller.signal).then(result => setSources(result.items)).catch(() => {});
    return () => controller.abort();
  }, []);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (start && end && start > end) { setError('La fecha inicial no puede ser posterior a la final.'); return; }
    if (minimum && maximum && Number(minimum) > Number(maximum)) { setError('El rango de magnitud es inválido.'); return; }
    if (minimumDepth && maximumDepth && Number(minimumDepth) > Number(maximumDepth)) { setError('El rango de profundidad es inválido.'); return; }
    setError('');
    setFilters({
      ...(start ? { start_time: `${start}T00:00:00Z` } : {}),
      ...(end ? { end_time: `${end}T23:59:59.999Z` } : {}),
      ...(minimum !== '' ? { min_magnitude: Number(minimum) } : {}),
      ...(maximum !== '' ? { max_magnitude: Number(maximum) } : {}),
      ...(minimumDepth !== '' ? { min_depth: Number(minimumDepth) } : {}),
      ...(maximumDepth !== '' ? { max_depth: Number(maximumDepth) } : {}),
      ...(source ? { source } : {}),
    });
  }

  function reset() {
    setStart(''); setEnd(''); setMinimum(''); setMaximum(''); setMinimumDepth(''); setMaximumDepth(''); setSource(''); setError('');
    setFilters({});
  }

  async function download() {
    setExporting(true); setError('');
    try { await downloadEventsCsv(filters); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible exportar'); }
    finally { setExporting(false); }
  }

  return (
    <form onSubmit={apply} className="rounded-2xl border border-border-ui bg-panel p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-main"><Filter size={17} className="text-accent" /> Filtros compartidos</div>
        <span className="text-xs text-muted">Fechas en UTC · Se aplican al panel, mapa y análisis</span>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted">Desde (UTC)
          <input type="date" className={fieldClass} value={start} onChange={e => setStart(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted">Hasta (UTC)
          <input type="date" className={fieldClass} value={end} onChange={e => setEnd(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted">Magnitud mínima
          <input type="number" className={fieldClass} min="-3" max="12" step="0.1" placeholder="Sin mínimo" value={minimum} onChange={e => setMinimum(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted">Magnitud máxima
          <input type="number" className={fieldClass} min="-3" max="12" step="0.1" placeholder="Sin máximo" value={maximum} onChange={e => setMaximum(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted">Profundidad mínima (km)
          <input type="number" className={fieldClass} min="-20" max="1000" step="0.1" placeholder="Sin mínimo" value={minimumDepth} onChange={e => setMinimumDepth(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted">Profundidad máxima (km)
          <input type="number" className={fieldClass} min="-20" max="1000" step="0.1" placeholder="Sin máximo" value={maximumDepth} onChange={e => setMaximumDepth(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted">Fuente
          <select className={fieldClass} value={source} onChange={e => setSource(e.target.value)}>
            <option value="">Todas</option>
            {sources.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white dark:text-neutral-950"><Filter size={15}/> Aplicar</button>
        <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt"><RotateCcw size={15}/> Limpiar</button>
        <button type="button" onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt"><RefreshCw size={15}/> Actualizar</button>
        <button type="button" onClick={download} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt disabled:opacity-40"><Download size={15}/> {exporting ? 'Exportando...' : 'Exportar CSV'}</button>
        <span className="text-xs text-muted">Máximo 5 000 registros recientes filtrados por descarga</span>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
    </form>
  );
}
