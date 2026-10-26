/** Reportes oficiales publicados por el IGP; lectura bajo demanda y cada 5 minutos.
 * La hora de consulta es distinta de la hora del sismo y de la publicación.
 */
import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Clock3, RefreshCw, Wifi } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const IGP_URL = 'https://ultimosismo.igp.gob.pe/productos/reportes-sismicos';

type IGPEvent = {
  external_id: string;
  occurred_at: string;
  latitude: number;
  longitude: number;
  magnitude: number | null;
  depth_km: number | null;
  place: string | null;
  source_url: string;
};
type Feed = {
  items: IGPEvent[];
  fetched_at: string;
  latest_event_at: string | null;
  latest_age_hours: number | null;
  message: string;
};

// La URL individual IGP existe para códigos oficiales como 2026-0647.
function reportLink(code: string) {
  return /^\d{4}-\d{4,6}$/.test(code)
    ? `https://ultimosismo.igp.gob.pe/evento/${code}` : IGP_URL;
}

function peru(iso: string) {
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'medium' });
}

export default function IGPLivePanel() {
  const [recent, setRecent] = useState<Feed | null>(null);
  const [latest, setLatest] = useState<Feed | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(r => r + 1), []);

  useEffect(() => {
    // Refresco periódico del navegador; FastAPI cachea 120 s por instancia.
    const controller = new AbortController();
    setLoading(true);
    const read = async (feed: 'recent' | 'latest'): Promise<Feed> => {
      const response = await fetch(`${API_BASE}/api/v1/igp/${feed}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`IGP HTTP ${response.status}`);
      return (await response.json()) as Feed;
    };
    Promise.allSettled([read('recent'), read('latest')]).then(([r, l]) => {
      if (controller.signal.aborted) return;
      if (r.status === 'fulfilled') setRecent(r.value);
      if (l.status === 'fulfilled') setLatest(l.value);
      setError([r, l].every(x => x.status === 'rejected')
        ? 'No se pudo consultar las capas IGP desde FastAPI. Revisa la disponibilidad de la fuente.'
        : (r.status === 'rejected' || l.status === 'rejected')
          ? 'Una de las capas IGP no respondió; los datos mostrados pueden ser parciales.' : '');
      setLoading(false);
    });
    const interval = window.setInterval(refresh, 5 * 60_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [revision, refresh]);

  const latestEvent = latest?.items[0];
  return (
    <section className="overflow-hidden rounded-2xl border border-border-ui bg-panel" aria-label="Monitoreo IGP">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-ui px-5 py-4">
        <div className="flex items-center gap-2">
          <Wifi size={18} className="text-accent" aria-hidden="true" />
          <h2 className="font-semibold text-main">IGP/CENSIS · Reportes publicados</h2>
        </div>
        <button type="button" onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt disabled:opacity-60">
          <RefreshCw size={15} aria-hidden="true" /> Consultar ahora
        </button>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-xs text-muted">Consulta directa al servicio ArcGIS REST oficial mediante FastAPI. La página comprueba novedades cada 5 minutos, pero la publicación depende del IGP. No es un sistema de alerta temprana.</p>
        {error && <p role="alert" className="rounded-lg border border-border-ui bg-panel-alt p-3 text-sm text-main">{error}</p>}
        {loading && <p role="status" className="text-sm text-muted">Consultando capas del IGP…</p>}
        {latestEvent && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-panel-alt p-4">
            <div>
              <p className="text-xs font-medium text-muted">Último sismo según la capa «Último Sismo»</p>
              <p className="mt-1 text-lg font-semibold text-main">M {latestEvent.magnitude?.toFixed(1) ?? '—'} · {latestEvent.place || 'Sin referencia'}</p>
              <p className="mt-1 text-sm text-muted">{peru(latestEvent.occurred_at)} · Profundidad {latestEvent.depth_km?.toFixed(1) ?? '—'} km</p>
            </div>
            <a href={IGP_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">Contrastar en IGP <ArrowUpRight size={15}/></a>
          </div>
        )}
        {recent && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><Clock3 size={13}/> Consultado: {peru(recent.fetched_at)}</span>
            <span>Último en lista: {recent.latest_event_at ? peru(recent.latest_event_at) : 'sin registros'}</span>
            <span>{recent.items.length} reportes visibles</span>
          </div>
        )}
        {recent && recent.latest_age_hours !== null && recent.latest_age_hours > 24 &&
          <p className="rounded-lg border border-border-ui bg-panel-alt p-3 text-sm text-main">
            La última fecha publicada en esta capa tiene más de 24 horas. Puede ser una demora de actualización o una diferencia entre capas; no se debe interpretar como ausencia de sismos.
          </p>}
        {recent && recent.items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border-ui">
            <table className="w-full min-w-[1150px] text-left text-sm">
              <thead className="bg-panel-alt text-xs uppercase text-muted"><tr>
                <th className="p-3">Fecha UTC</th><th className="p-3">Magnitud</th><th className="p-3">Prof. km</th>
                <th className="p-3">Latitud</th><th className="p-3">Longitud</th><th className="p-3">Ubicación</th>
                <th className="p-3">Fuente</th><th className="p-3">ID origen</th><th className="p-3">URL oficial</th>
              </tr></thead>
              <tbody className="divide-y divide-border-ui">{recent.items.map((e) => (
                <tr key={e.external_id} className="hover:bg-panel-alt">
                  <td className="whitespace-nowrap p-3 text-main" title={`Perú: ${peru(e.occurred_at)}`}>{new Date(e.occurred_at).toISOString().replace('.000Z', 'Z')}</td>
                  <td className="p-3 font-semibold text-main">{e.magnitude?.toFixed(1) ?? '—'}</td>
                  <td className="p-3 text-muted">{e.depth_km?.toFixed(1) ?? '—'}</td>
                  <td className="p-3 text-muted">{e.latitude.toFixed(4)}</td>
                  <td className="p-3 text-muted">{e.longitude.toFixed(4)}</td>
                  <td className="p-3 text-main">{e.place || 'Sin referencia'}</td>
                  <td className="p-3"><span className="rounded-md border border-border-ui bg-panel-alt px-2 py-1 text-xs">IGP/CENSIS</span></td>
                  <td className="p-3 font-mono text-xs">{e.external_id}</td>
                  <td className="p-3"><a href={reportLink(e.external_id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline">Ficha IGP <ArrowUpRight size={14} /></a></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {!loading && recent && recent.items.length === 0 &&
          <p className="flex items-center gap-2 text-sm text-muted"><Activity size={17}/> La capa IGP no devolvió reportes interpretables.</p>}
        <p className="text-xs text-soft">Fuente: Instituto Geofísico del Perú (IGP/CENSIS). Las magnitudes reportadas no deben tratarse como categorías oficiales de riesgo. Los datos consultados directamente aún no están incorporados a los gráficos históricos de Supabase.</p>
      </div>
    </section>
  );
}
