/** Catálogo real de sismos persistidos con filtros y paginación de servidor. */
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useEffect, useState, type FormEvent } from 'react';
import { Archive, Activity, ArrowUpRight, ChevronLeft, ChevronRight, Filter, RefreshCw } from 'lucide-react';
import { getEvents, type EventFilters } from '../../services/seismic';
import type { EventPage } from '../../types/seismic';
import IGPLivePanel from './IGPLivePanel';
import { Link } from 'react-router-dom';

// Solo enlazar fichas por código IGP validado; para USGS usar el enlace almacenado.
function officialLink(source: string, externalId: string, storedUrl: string): string | null {
  if (source === 'IGP/CENSIS') {
    return /^\d{4}-\d{4,6}$/.test(externalId)
      ? `https://ultimosismo.igp.gob.pe/evento/${externalId}`
      : 'https://ultimosismo.igp.gob.pe/productos/reportes-sismicos';
  }
  try {
    const url = new URL(storedUrl);
    return url.protocol === 'https:' && url.hostname.endsWith('.usgs.gov') ? url.href : null;
  } catch { return null; }
}

function utcTime(iso: string) { return new Date(iso).toISOString().replace('.000Z', 'Z'); }

function localTime(iso: string) {
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });
}

export default function Page() {
  const [page, setPage] = useState(1);
  const [magnitudeInput, setMagnitudeInput] = useState('');
  const [sourceInput, setSourceInput] = useState('IGP/CENSIS');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [filters, setFilters] = useState<Omit<EventFilters, 'page' | 'page_size'>>({ source: 'IGP/CENSIS' });
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
      ...(sourceInput ? { source: sourceInput } : {}),
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
          <p className="mt-2 text-sm text-muted">Reportes publicados por IGP y catálogo persistido en Supabase. La tabla muestra fecha UTC y enlaces a cada ficha oficial cuando existe.</p>
        </div>
        <button type="button" onClick={() => setRevision(v => v + 1)} className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-3 py-2 text-sm text-main hover:bg-panel-alt"><RefreshCw size={16} /> Actualizar</button>
      </div>
      <Link to="/historico-igp" className="inline-flex items-center gap-2 rounded-lg border border-border-ui bg-panel px-4 py-2 text-sm text-accent hover:bg-panel-alt"><Archive size={16}/> Consultar histórico oficial IGP 1960–2025</Link>
      <IGPLivePanel />
      <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border-ui bg-panel p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">Fuente
          <select value={sourceInput} onChange={e => setSourceInput(e.target.value)} className="rounded-lg border border-border-ui bg-page px-3 py-2 text-sm text-main">
            <option value="IGP/CENSIS">IGP/CENSIS (caché)</option>
            <option value="USGS">USGS (histórico complementario)</option>
            <option value="">Todas las fuentes</option>
          </select>
        </label>
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
          <h2 className="font-semibold text-main">Catálogo almacenado en Supabase · IGP y USGS</h2>
          <span className="text-xs text-muted">{data?.total ?? '—'} eventos</span>
        </div>
        {error && <p role="alert" className="m-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">{error}. Comprueba FastAPI y Supabase.</p>}
        {loading ? <LoadingSpinner label="Consultando eventos…" />
          : data?.items.length ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-sm">
              <thead className="bg-panel-alt text-xs uppercase text-muted"><tr>
                <th className="px-3 py-3">Fecha UTC</th><th className="px-3 py-3">Magnitud</th>
                <th className="px-3 py-3">Prof. km</th><th className="px-3 py-3">Latitud</th><th className="px-3 py-3">Longitud</th>
                <th className="px-3 py-3">Ubicación</th><th className="px-3 py-3">Fuente</th>
                <th className="px-3 py-3">ID origen</th><th className="px-3 py-3">URL oficial</th>
              </tr></thead>
              <tbody className="divide-y divide-border-ui">{data.items.map(event => {
                const url = officialLink(event.source_name, event.external_id, event.source_url);
                return (<tr key={event.id} className="hover:bg-panel-alt">
                  <td className="whitespace-nowrap px-3 py-3 text-main" title={`Perú: ${localTime(event.occurred_at)}`}>{utcTime(event.occurred_at)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-main">{event.magnitude === null ? '—' : event.magnitude.toFixed(1)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{event.depth_km === null ? '—' : event.depth_km.toFixed(1)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{event.latitude.toFixed(4)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{event.longitude.toFixed(4)}</td>
                  <td className="max-w-80 px-3 py-3 text-main">{event.place ?? 'Sin referencia'}</td>
                  <td className="px-3 py-3"><span className="inline-flex rounded-md border border-border-ui bg-panel-alt px-2 py-1 text-xs text-main">{event.source_name}</span></td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted">{event.external_id}</td>
                  <td className="whitespace-nowrap px-3 py-3">{url ? <a href={url} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-1 text-accent hover:underline">{event.source_name === 'IGP/CENSIS' ? 'Ficha IGP' : 'USGS'} <ArrowUpRight size={14} /></a> : <span className="text-muted">No disponible</span>}</td>
                </tr>);
              })}</tbody>
            </table></div>
          ) : <div className="flex flex-col items-center gap-2 p-12 text-center"><Activity className="text-soft" size={26} /><p className="font-medium text-main">No hay eventos para estos filtros</p><p className="text-sm text-muted">Prueba otra fuente o período; la caché IGP 2026 puede estar incompleta hasta ejecutar la carga anual.</p></div>
        }
        <div className="flex items-center justify-between border-t border-border-ui px-5 py-4 text-sm text-muted">
          <span>Página {page} de {pages}</span>
          <div className="flex gap-2">
            <button aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)} className="rounded-lg border border-border-ui p-2 disabled:opacity-40"><ChevronLeft size={16}/></button>
            <button aria-label="Página siguiente" disabled={page >= pages || loading} onClick={() => setPage(v => v + 1)} className="rounded-lg border border-border-ui p-2 disabled:opacity-40"><ChevronRight size={16}/></button>
          </div>
        </div>
      </section>
      <p className="text-xs text-soft">IGP/CENSIS: reportes oficiales almacenados, cobertura inicial parcial hasta finalizar el backfill 2026. USGS: catálogo complementario que puede incluir países vecinos. Los registros de fuentes distintas no se suman como eventos únicos. Información no predictiva.</p>
    </div>
  );
}
