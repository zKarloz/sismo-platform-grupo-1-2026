/**
 * Histórico instrumental IGP: el usuario define el período ANTES de consultar.
 * No se descargan filas automáticamente al abrir la pantalla.
 * La interfaz solicita FECHAS sin hora. Para la API, cada día se traduce
 * explícitamente al intervalo UTC completo, sin usar la zona del navegador.
 * Las exportaciones reutilizan exactamente los filtros de la última consulta.
 */
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import {useEffect, useState, type FormEvent} from 'react';
import {Archive, ArrowUpRight, CalendarRange, ChevronLeft, ChevronRight, Download, Info, RefreshCcw, Search} from 'lucide-react';
import {useAuth} from '../../auth/AuthProvider';
import {readHistory, exportHistory, type HistoryFilters, type HistoryPage} from '../../services/igpHistory';

const control = 'w-full rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main outline-none focus-visible:ring-2 focus-visible:ring-accent';
const MIN_DATE = '1960-01-01';
const MAX_DATE = '2025-12-31';
const MIN_YEAR = 1960;
const MAX_YEAR = 2025;

type DateDraft = {start: string; end: string; min_magnitude?: number; max_depth?: number;
  south?: number; west?: number; north?: number; east?: number};

export default function Page() {
  const {profile} = useAuth();
  // Un período vacío evita una consulta involuntaria al abrir el módulo.
  const [draft, setDraft] = useState<DateDraft>({start: '', end: ''});
  // El selector de año solo rellena las fechas; nunca ejecuta una búsqueda.
  const [selectedYear, setSelectedYear] = useState('2025');
  const [applied, setApplied] = useState<HistoryFilters | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<HistoryPage | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState('');
  const canExport = profile?.role !== 'solo_lectura';

  // Cambiar un filtro invalida la consulta anterior: no descargar con criterios viejos.
  function update<K extends keyof DateDraft>(key: K, value: DateDraft[K]) {
    setDraft(previous => ({...previous, [key]: value}));
    setApplied(null);
    setResult(null);
    setError('');
    setPage(1);
  }
  function applyYear() {
    // Un año fuera de 1960–2025 no debe generar consultas ni fechas inválidas.
    const year = Number(selectedYear);
    if (!/^\d{4}$/.test(selectedYear) || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      setError('Selecciona un año válido entre 1960 y 2025.');
      return;
    }
    setDraft(previous => ({...previous, start: `${year}-01-01`, end: `${year}-12-31`}));
    setApplied(null);
    setResult(null);
    setError('');
    setPage(1);
  }
  useEffect(() => {
    if (!applied) {setPending(false); return;}
    const controller = new AbortController();
    setPending(true);
    setError('');
    readHistory(applied, page, controller.signal)
      .then(data => {if (!controller.signal.aborted) setResult(data);})
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setResult(null);
          setError(cause instanceof Error ? cause.message : 'No se pudo consultar el catálogo IGP');
        }
      })
      .finally(() => {if (!controller.signal.aborted) setPending(false);});
    return () => controller.abort();
  }, [applied, page, revision]);

  function consult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.start || !draft.end) {
      setError('Selecciona la fecha inicial y final (UTC).'); return;
    }
    if (draft.start < MIN_DATE || draft.end > MAX_DATE || draft.start > draft.end) {
      setError('El período debe ser válido y estar entre 1960 y 2025 (UTC).'); return;
    }
    const coordinates = [draft.south, draft.west, draft.north, draft.east];
    if (coordinates.some(value => value !== undefined) && coordinates.some(value => value === undefined)) {
      setError('Completa los cuatro límites geográficos o déjalos vacíos.'); return;
    }
    if (draft.south !== undefined && draft.north !== undefined && draft.west !== undefined && draft.east !== undefined &&
        (draft.south > draft.north || draft.west > draft.east)) {
      setError('Los límites geográficos están invertidos.'); return;
    }
    // Fechas UTC inclusivas: el día inicial empieza a las 00:00:00 y el final
    // termina a las 23:59:59.999999, incluido el último segundo del día.
    const filters: HistoryFilters = {
      start_at: `${draft.start}T00:00:00Z`, end_at: `${draft.end}T23:59:59.999999Z`,
      year_from: Number(draft.start.slice(0, 4)), year_to: Number(draft.end.slice(0, 4)),
      min_magnitude: draft.min_magnitude, max_depth: draft.max_depth,
      south: draft.south, west: draft.west, north: draft.north, east: draft.east,
    };
    setResult(null);
    setPage(1);
    setApplied(filters);
    setRevision(old => old + 1);
  }

  async function download(format: 'csv' | 'xlsx' | 'pdf') {
    if (!applied || !result?.total) return;
    setError(''); setExporting(format);
    try {await exportHistory(applied, format);}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Error al descargar');}
    finally {setExporting('');}
  }
  const period = applied ? `${applied.start_at?.slice(0, 10)} — ${applied.end_at?.slice(0, 10)} (días completos UTC)` : '';

  return <main className="space-y-5">
    <header>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Fuente oficial · Catálogo instrumental</p>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-main"><Archive size={28}/> Histórico IGP 1960–2025</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">Selecciona un período para consultar el snapshot oficial CENSIS. Los datos no se incorporan a Supabase, a los modelos entrenados ni a las alertas operativas.</p>
    </header>

    <form onSubmit={consult} className="rounded-xl border border-border-ui bg-panel p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-main"><CalendarRange size={18}/> Consultar período histórico</h2>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border-ui bg-panel-alt p-3">
        <label htmlFor="history-full-year" className="min-w-[150px] flex-1 space-y-1 text-xs font-medium text-muted">
          Año completo (1960–2025)
          <input id="history-full-year" aria-label="Seleccionar año completo" type="number" min={MIN_YEAR} max={MAX_YEAR} step={1}
            className={control} value={selectedYear} onChange={event => setSelectedYear(event.target.value)}/>
        </label>
        <button type="button" onClick={applyYear}
          className="rounded-lg border border-border-ui bg-panel px-4 py-2 text-sm font-medium text-main hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Aplicar año
        </button>
        <p className="w-full text-xs text-muted">Usa las flechas del selector y pulsa «Aplicar año» para completar automáticamente ambas fechas. No se consulta hasta pulsar «Consultar sismos».</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-muted">Fecha inicial (UTC)
          <input className={control} type="date" min={MIN_DATE} max={MAX_DATE} required
            value={draft.start} onChange={e => update('start', e.target.value)}/></label>
        <label className="space-y-1 text-xs font-medium text-muted">Fecha final (UTC)
          <input className={control} type="date" min={MIN_DATE} max={MAX_DATE} required
            value={draft.end} onChange={e => update('end', e.target.value)}/></label>
      </div>
      <p className="mt-2 text-xs text-muted">Cada fecha incluye el día completo en UTC (00:00:00–23:59:59). El catálogo original utiliza horas UTC; no se convierten a la zona del navegador.</p>
      <details className="mt-4 rounded-lg border border-border-ui p-3 text-sm text-main">
        <summary className="cursor-pointer font-medium">Filtros adicionales (opcional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-muted">Magnitud mínima
            <input className={control} type="number" step="0.1" min="0" max="10" placeholder="Todas"
              value={draft.min_magnitude ?? ''} onChange={e => update('min_magnitude', e.target.value === '' ? undefined : Number(e.target.value))}/></label>
          <label className="space-y-1 text-xs text-muted">Profundidad máxima (km)
            <input className={control} type="number" step="1" min="0" max="900" placeholder="Todas"
              value={draft.max_depth ?? ''} onChange={e => update('max_depth', e.target.value === '' ? undefined : Number(e.target.value))}/></label>
        </div>
        <p className="mt-3 text-xs text-muted">Zona geográfica opcional (WGS84). El rectángulo puede incluir áreas fuera de Perú.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          {(['south', 'west', 'north', 'east'] as const).map(key => <label key={key} className="space-y-1 text-xs text-muted">
            {({south:'Latitud sur', west:'Longitud oeste', north:'Latitud norte', east:'Longitud este'} as const)[key]}
            <input className={control} type="number" step="any" placeholder="Sin límite"
              value={draft[key] ?? ''} onChange={e => update(key, e.target.value === '' ? undefined : Number(e.target.value))}/>
          </label>)}
        </div>
        <button type="button" onClick={() => {
          setDraft(previous => ({...previous, south:undefined, west:undefined, north:undefined, east:undefined}));
          setApplied(null); setResult(null); setError('');
        }} className="mt-2 text-xs text-accent hover:underline">Limpiar zona</button>
      </details>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">Los filtros se aplican únicamente al pulsar Consultar.</span>
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white dark:text-neutral-950"><Search size={16}/> Consultar sismos</button>
      </div>
    </form>

    {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}

    {!applied && <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-ui bg-panel px-5 py-12 text-center">
      <CalendarRange size={34} className="text-muted" aria-hidden="true"/>
      <h2 className="text-base font-semibold text-main">Selecciona el período que deseas consultar</h2>
      <p className="max-w-md text-sm text-muted">Elige las fechas inicial y final o aplica un año completo; después pulsa «Consultar sismos». Después verás la tabla, los filtros aplicados y las opciones de exportación.</p>
    </section>}

    {applied && <section className="overflow-hidden rounded-xl border border-border-ui bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-ui px-4 py-4">
        <div>
          <h2 className="font-semibold text-main">Resultados del catálogo</h2>
          <p className="mt-1 text-xs text-muted">{period}</p>
          <p className="mt-1 text-xs text-muted">{pending ? 'Consultando…' : `${result?.total ?? '—'} coincidencias · Página ${page} de ${result?.pages ?? 1}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => {setResult(null); setRevision(old => old + 1);}} disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-xs text-main hover:bg-panel-alt disabled:opacity-40">
            <RefreshCcw size={15}/> Actualizar consulta
          </button>
          {canExport && !!result?.total && !pending && (['csv', 'xlsx', 'pdf'] as const).map(format =>
            <button key={format} type="button" disabled={!!exporting || (format === 'pdf' && result.total > 400) || (format !== 'pdf' && result.total > 5000)}
              onClick={() => void download(format)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-xs font-semibold uppercase text-main hover:bg-panel-alt disabled:opacity-40">
              {exporting === format ? <LoadingSpinner size="sm" variant="inline" label="Generando…" /> : <><Download size={15}/>{format}</>}
            </button>)}
        </div>
        {!!result?.total && result.total > 400 && <p className="w-full text-xs text-muted">PDF: máximo 400 registros; ajusta el período, magnitud o zona. CSV/XLSX: máximo 5.000, sujeto a la configuración del sistema.</p>}
      </div>
      {pending ? <LoadingSpinner label="Consultando el histórico IGP…" />
        : result?.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1070px] text-left text-sm">
          <thead className="bg-panel-alt text-xs uppercase text-muted"><tr>
            {['Fecha UTC', 'Magnitud', 'Prof. km', 'Latitud', 'Longitud', 'Fuente', 'ID catálogo', 'Origen oficial'].map(label =>
              <th className="px-3 py-3" key={label}>{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border-ui">{result.items.map(row => <tr key={row.id} className="hover:bg-panel-alt">
            <td className="whitespace-nowrap px-3 py-3 text-main">{row.fecha_utc.replace('+00:00', 'Z')}</td>
            <td className="px-3 py-3 font-semibold text-main">{row.magnitud.toFixed(1)}</td>
            <td className="px-3 py-3 text-muted">{row.profundidad_km.toFixed(1)}</td>
            <td className="px-3 py-3 text-muted">{row.latitud.toFixed(3)}</td>
            <td className="px-3 py-3 text-muted">{row.longitud.toFixed(3)}</td>
            <td className="px-3 py-3"><span className="rounded-md border border-border-ui bg-panel-alt px-2 py-1 text-xs">IGP histórico</span></td>
            <td className="px-3 py-3 font-mono text-xs text-muted">{row.id_origen}</td>
            <td className="px-3 py-3"><a href={row.url_origen} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">Catálogo oficial <ArrowUpRight size={14}/></a></td>
          </tr>)}</tbody>
        </table></div> : <p className="p-8 text-center text-sm text-muted">No se encontraron registros para el período y los filtros seleccionados.</p>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-ui px-4 py-3 text-sm text-muted">
        <span>Mostrando {result?.items.length ?? 0} de {result?.total ?? 0}</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Página anterior" disabled={pending || page <= 1} onClick={() => {setResult(null); setPage(old => Math.max(1, old - 1));}}
            className="rounded-lg border border-border-ui p-2 disabled:opacity-40"><ChevronLeft size={16}/></button>
          <span className="px-2 py-2">{page} / {result?.pages ?? 1}</span>
          <button type="button" aria-label="Página siguiente" disabled={pending || page >= (result?.pages ?? 1)} onClick={() => {setResult(null); setPage(old => old + 1);}}
            className="rounded-lg border border-border-ui p-2 disabled:opacity-40"><ChevronRight size={16}/></button>
        </div>
      </footer>
    </section>}

    {result?.source && applied && <aside className="rounded-xl border border-border-ui bg-panel p-4 text-xs text-muted">
      <p className="mb-2 flex items-center gap-2 font-semibold text-main"><Info size={16}/> Procedencia y versión</p>
      <p>IGP/CENSIS · Publicación: {result.source.published_at ?? 'No declarada para el XLSX'} · Lectura: {new Date(result.source.retrieved_at).toLocaleString('es-PE', {timeZone:'America/Lima'})}</p>
      <p className="mt-1">Registros del archivo: {result.source.source_rows} · Registros inválidos: {result.source.invalid_rows} · {result.source.storage}</p>
      <p className="mt-1">{result.source.warning}</p>
      <p className="mt-1 break-all font-mono">SHA-256 normalizado: {result.source.snapshot_sha256}</p>
      {result.source.original_xlsx_sha256 && <p className="mt-1 break-all font-mono">SHA-256 del XLSX: {result.source.original_xlsx_sha256}</p>}
      {result.source.original_csv_sha256 && <p className="mt-1 break-all font-mono">SHA-256 del CSV: {result.source.original_csv_sha256}</p>}
      <p className="mt-2">Los identificadores son referencias de filas del catálogo, no fichas sísmicas individuales. La cobertura instrumental histórica es variable.</p>
    </aside>}
  </main>;
}
