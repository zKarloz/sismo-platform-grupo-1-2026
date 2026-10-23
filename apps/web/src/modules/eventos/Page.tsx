/** Catálogo real de sismos persistidos con filtros y paginación de servidor. */
import { useEffect, useState, type FormEvent } from 'react';
import { Activity, ArrowUpRight, ChevronLeft, ChevronRight, Filter, RefreshCw } from 'lucide-react';
import { getEvents, type EventFilters } from '../../services/seismic';
import type { EventPage } from '../../types/seismic';
import IGPLivePanel from './IGPLivePanel';

function localTime(iso: string) {
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });
}

export default function Page() {
  const [page, setPage] = useState(1);
  const [magnitudeInput, setMagnitudeInput] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [filters, setFilters] = useState<Omit<EventFilters, 'page' | 'page_size'>>({});
  const [data, setData] = useState<EventPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getEvents({ ...filters, page, page_size: 20 }, controller.signal)
      .then(setData)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'No se pudieron recuperar los eventos');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page, revision]);

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fromInput && toInput && fromInput > toInput) { setError('La fecha inicial debe ser anterior a la fecha final.'); return; }
    setPage(1);
    setFilters({
      ...(magnitudeInput !== '' ? { min_magnitude: Number(magnitudeInput) } : {}),
      ...(fromInput ? { start_time: `${fromInput}T00:00:00Z` } : {}),
      ...(toInput ? { end_time: `${toInput}T23:59:59Z` } : {}),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Fase 3 · Catálogo verificable</p>
          <h1 className="mt-2 text-3xl font-bold text-main">Eventos sísmicos</h1>
          <p className="mt-2 text-sm text-muted">Reportes recientes del IGP y, debajo, catálogo de eventos almacenados en Supabase. Horas de Perú (UTC−5).</p>
        </div>
        <button type="button" onClick={() => setRevision(v => v + 1)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt"><RefreshCw size={16} /> Actualizar</button>
      </div>
      <IGPLivePanel />
      <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border-ui bg-panel p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">Magnitud mínima
          <input type="number" step="0.1" min="-3" max="12" value={magnitudeInput} onChange={event => setMagnitudeInput(event.target.value)} placeholder="Todas" className="w-32 rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">Desde (UTC)
          <input type="date" value={fromInput} onChange={event => setFromInput(event.target.value)} className="rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">Hasta (UTC)
          <input type="date" value={toInput} onChange={event => setToInput(event.target.value)} className="rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main" />
        </label>
        <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white dark:text-neutral-950"><Filter size={16} /> Filtrar</button>
      </form>
      <section className="overflow-hidden rounded-2xl border border-border-ui bg-panel">
        <div className="flex items-center justify-between border-b border-border-ui px-5 py-4">
          <h2 className="font-semibold text-main">Catálogo almacenado en Supabase (histórico USGS)</h2>
          <span className="text-xs text-muted">{data?.total ?? '—'} eventos</span>
        </div>
        {error && <p role="alert" className="m-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">{error}. Comprueba FastAPI y Supabase.</p>}
        {loading ? <p className="p-8 text-center text-sm text-muted">Consultando eventos...</p>
          : data?.items.length ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-panel-alt text-xs uppercase text-muted"><tr>
                <th className="px-5 py-3">Fecha/hora (Perú)</th><th className="px-5 py-3">Magnitud</th><th className="px-5 py-3">Profundidad</th><th className="px-5 py-3">Localidad</th><th className="px-5 py-3">Fuente</th><th className="px-5 py-3">Origen</th>
              </tr></thead>
              <tbody className="divide-y divide-border-ui">{data.items.map(event => (
                <tr key={event.id} className="hover:bg-panel-alt">
                  <td className="whitespace-nowrap px-5 py-3 text-main">{localTime(event.occurred_at)}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-semibold text-main">{event.magnitude === null ? '—' : event.magnitude.toFixed(1)} <span className="font-normal text-muted">{event.magnitude_type ?? ''}</span></td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted">{event.depth_km === null ? '—' : `${event.depth_km.toFixed(1)} km`}</td>
                  <td className="max-w-80 px-5 py-3 text-main">{event.place ?? 'No especificada'}</td>
                  <td className="px-5 py-3 text-muted">{event.source_name}</td>
                  <td className="px-5 py-3"><a href={event.source_url} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-1 text-accent hover:underline">Ver <ArrowUpRight size={14} /></a></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div className="flex flex-col items-center gap-2 p-12 text-center"><Activity className="text-soft" size={26} /><p className="font-medium text-main">No hay eventos para estos filtros</p><p className="text-sm text-muted">Ejecuta la sincronización USGS desde la terminal 3 o ajusta el rango.</p></div>
        }
        <div className="flex items-center justify-between border-t border-border-ui px-5 py-4 text-sm text-muted">
          <span>Página {page} de {pages}</span>
          <div className="flex gap-2">
            <button aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)} className="rounded-lg border border-border-ui p-2 disabled:opacity-40"><ChevronLeft size={16}/></button>
            <button aria-label="Página siguiente" disabled={page >= pages || loading} onClick={() => setPage(v => v + 1)} className="rounded-lg border border-border-ui p-2 disabled:opacity-40"><ChevronRight size={16}/></button>
          </div>
        </div>
      </section>
      <p className="text-xs text-soft">Cobertura: rectángulo de consulta de Perú y entorno cercano, no límites políticos exactos. Datos informativos sin carácter oficial ni predictivo.</p>
    </div>
  );
}
