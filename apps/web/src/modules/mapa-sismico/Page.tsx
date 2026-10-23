/** Mapa de sismos OBSERVADOS: IGP reciente como vista nacional principal,
 * catálogo histórico Supabase como vista alternativa, SIN sumar ambas fuentes.
 */
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ArrowUpRight, ExternalLink, MapPin, RefreshCw } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import FilterBar from '../../components/analytics/FilterBar';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { useIGPFeed } from '../../hooks/useIGPFeed';
import { getMapEvents } from '../../services/analytics';
import { IGP_OFFICIAL_URL, igpFreshnessWarning, peruDate } from '../../services/igp';
import type { GeoDataset, GeoFeature } from '../../types/analytics';

const buttonBase = 'rounded-lg border px-3 py-2 text-sm font-medium transition-colors';
type MapSource = 'igp' | 'catalog';

/** Ajusta el encuadre cuando cambian los marcadores; nunca calcula zonas de impacto. */
function FitMarkers({ features }: { features: GeoFeature[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = features.filter(f => Number.isFinite(f.geometry.coordinates[0]) && Number.isFinite(f.geometry.coordinates[1]));
    if (!valid.length) { map.setView([-9.19, -75.0], 5); return; }
    const bounds = L.latLngBounds(valid.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]] as L.LatLngTuple));
    if (valid.length === 1) map.setView(bounds.getCenter(), 7);
    else map.fitBounds(bounds.pad(0.16), { maxZoom: 8 });
  }, [features, map]);
  return null;
}

export default function Page() {
  const { filters, revision } = useAnalyticsFilters();
  const [source, setSource] = useState<MapSource>('igp');
  const igp = useIGPFeed('recent', source === 'igp');
  const [dataset, setDataset] = useState<GeoDataset | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  // Se consulta PostgreSQL solo cuando el usuario elige la vista histórica.
  useEffect(() => {
    if (source !== 'catalog') return;
    const controller = new AbortController();
    setCatalogLoading(true); setCatalogError('');
    getMapEvents(filters, controller.signal)
      .then(result => { if (!controller.signal.aborted) setDataset(result); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setDataset(null);
          setCatalogError(cause instanceof Error ? cause.message : 'No se pudo recuperar el catálogo');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [source, filters, revision]);

  // Solo 20 reportes recientes de IGP: no equivale a todo el catálogo nacional.
  // Las coordenadas siguen el contrato GeoJSON: [longitud, latitud].
  const igpFeatures = useMemo<GeoFeature[]>(() => (igp.data?.items ?? [])
    .filter(event => Number.isFinite(event.latitude) && Number.isFinite(event.longitude))
    .map(event => ({
      type: 'Feature',
      id: `igp-${event.external_id}`,
      geometry: { type: 'Point', coordinates: [event.longitude, event.latitude] },
      properties: {
        external_id: event.external_id,
        occurred_at: event.occurred_at,
        magnitude: event.magnitude,
        magnitude_type: event.magnitude_type,
        depth_km: event.depth_km,
        place: event.place,
        source_url: event.source_url,
        source_name: event.source_name,
      },
    })), [igp.data]);

  const features = source === 'igp' ? igpFeatures : dataset?.features ?? [];
  const loading = source === 'igp' ? igp.loading : catalogLoading;
  const error = source === 'igp' ? igp.error : catalogError;
  const staleMessage = igp.data ? igpFreshnessWarning(igp.data) : null;

  return <div className="space-y-6">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Epicentros observados · Perú y entorno</p>
      <h1 className="mt-2 text-3xl font-bold text-main">Mapa sísmico</h1>
      <p className="mt-2 text-sm text-muted">Selecciona el origen de los registros. Las capas IGP y Supabase son alternativas y no se agregan para evitar contar dos veces el mismo sismo.</p>
    </div>

    <div className="rounded-2xl border border-border-ui bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Fuente de datos para el mapa" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={source === 'igp'} onClick={() => setSource('igp')}
            className={`${buttonBase} ${source === 'igp' ? 'border-accent bg-accent-soft text-main' : 'border-border-ui text-muted hover:bg-panel-alt'}`}>
            IGP · Reportes recientes
          </button>
          <button type="button" aria-pressed={source === 'catalog'} onClick={() => setSource('catalog')}
            className={`${buttonBase} ${source === 'catalog' ? 'border-accent bg-accent-soft text-main' : 'border-border-ui text-muted hover:bg-panel-alt'}`}>
            Catálogo almacenado · Supabase
          </button>
        </div>
        {source === 'igp' && <button type="button" onClick={igp.refresh} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border-ui px-3 py-2 text-sm text-main hover:bg-panel-alt disabled:opacity-50">
          <RefreshCw size={15}/> Consultar IGP
        </button>}
      </div>
      {source === 'igp' ? <div className="mt-3 space-y-1 text-xs text-muted">
        <p>Vista principal: hasta 20 reportes de la capa IGP «Sismos Reportados». Se refresca cada 5 minutos con la página abierta; la publicación depende del IGP.</p>
        <p>Último evento visible: <strong className="text-main">{igp.data?.latest_event_at ? peruDate(igp.data.latest_event_at, true) : '—'}</strong> · Consultado: {igp.data ? peruDate(igp.data.fetched_at, true) : '—'}</p>
        <a href={IGP_OFFICIAL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">Contrastar con los reportes oficiales <ArrowUpRight size={13}/></a>
      </div> : <p className="mt-3 text-xs text-muted">Vista almacenada: USGS seleccionado por defecto; puedes elegir IGP o todas las fuentes. No sumes proveedores como si cada reporte fuera un sismo diferente. Los filtros y CSV se aplican solo aquí.</p>}
    </div>

    {source === 'catalog' && <FilterBar/>}
    {error && <p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">{error}. La vista no contiene datos actuales de esa fuente.</p>}
    {source === 'igp' && staleMessage && <p role="status" className="rounded-lg border border-border-ui bg-panel-alt p-3 text-sm text-main">{staleMessage}</p>}
    <section className="overflow-hidden rounded-2xl border border-border-ui bg-panel shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-ui p-4">
        <h2 className="flex items-center gap-2 font-semibold text-main"><MapPin className="text-accent" size={17}/>
          {source === 'igp' ? 'Epicentros publicados por IGP/CENSIS' : 'Epicentros del catálogo almacenado'}
        </h2>
        <span className="text-xs text-muted">
          {loading ? 'Consultando…' : source === 'igp' ? `${features.length} de ${igp.data?.items.length ?? 0} reportes recientes ubicados` : `${dataset?.returned ?? 0} de ${dataset?.total ?? 0} eventos almacenados`}
        </span>
      </div>
      {source === 'catalog' && dataset?.truncated && <p className="border-b border-border-ui bg-panel-alt px-4 py-2 text-sm text-main">Vista limitada a los {dataset.returned} sismos más recientes; aplica fechas o magnitud para explorar el resto.</p>}
      <div className="relative h-[520px] w-full">
        <MapContainer center={[-9.19, -75]} zoom={5} scrollWheelZoom={false} className="h-full w-full" style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' maxZoom={17}/>
          <FitMarkers features={features}/>
          {features.map(feature => {
            const [longitude, latitude] = feature.geometry.coordinates;
            const event = feature.properties;
            const radius = Math.min(17, Math.max(5, 5 + (event.magnitude ?? 0) * 1.7));
            return <CircleMarker key={feature.id} center={[latitude, longitude]} radius={radius} pathOptions={{ className: 'sismo-point', weight: 2, fillOpacity: 0.5 }}>
              <Popup>
                <div className="space-y-1 text-sm">
                  <strong>{event.place || 'Ubicación no disponible'}</strong>
                  <p>Magnitud: {event.magnitude === null ? 'Sin dato' : `${event.magnitude.toFixed(1)} ${event.magnitude_type ?? ''}`}</p>
                  <p>Profundidad: {event.depth_km === null ? 'Sin dato' : `${event.depth_km.toFixed(1)} km`}</p>
                  <p>Fecha/hora Perú: {peruDate(event.occurred_at, true)}</p>
                  <p>Fuente: {event.source_name}</p>
                  <a href={event.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-700">Ver fuente <ExternalLink size={12}/></a>
                </div>
              </Popup>
            </CircleMarker>;
          })}
        </MapContainer>
        {!loading && features.length === 0 && !error && <div className="pointer-events-none absolute left-1/2 top-4 z-[400] w-max max-w-[90%] -translate-x-1/2 rounded-lg bg-panel p-3 text-center text-sm text-main shadow-lg">No hay eventos disponibles en la vista seleccionada.</div>}
      </div>
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-xs text-muted">
        <span className="flex items-center gap-2"><span className="inline-block size-3 rounded-full bg-accent"/> El radio ilustra magnitud, no nivel de peligro</span>
        <span>Solo epicentros, sin zonas estimadas de impacto</span>
        <span>OpenStreetMap con atribución visible</span>
      </div>
    </section>
  </div>;
}
