/** Mapa interactivo de epicentros observados, con marcadores CircleMarker sin imágenes externas. */
import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, ExternalLink } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import FilterBar from '../../components/analytics/FilterBar';
import { useAnalyticsFilters } from '../../hooks/useAnalyticsFilters';
import { getMapEvents } from '../../services/analytics';
import type { GeoDataset, GeoFeature } from '../../types/analytics';

/** Centra automáticamente la vista al cambiar los filtros, con zoom máximo moderado. */
function FitMarkers({ features }: { features: GeoFeature[] }) {
  const map = useMap();
  useEffect(() => {
    if (!features.length) { map.setView([-9.19, -75.0], 5); return; }
    const bounds = L.latLngBounds(features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]] as L.LatLngTuple));
    if (features.length === 1) map.setView(bounds.getCenter(), 7);
    else map.fitBounds(bounds.pad(0.16), { maxZoom: 8 });
  }, [features, map]);
  return null;
}

function localTime(value: string) {
  return new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });
}

export default function Page() {
  const { filters, revision } = useAnalyticsFilters();
  const [dataset, setDataset] = useState<GeoDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    getMapEvents(filters, controller.signal)
      .then(result => { if (!controller.signal.aborted) setDataset(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo recuperar el mapa'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, revision]);

  return <div className="space-y-6">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Fase 4 · Ubicación observada</p>
      <h1 className="mt-2 text-3xl font-bold text-main">Mapa sísmico</h1>
      <p className="mt-2 text-sm text-muted">Epicentros reportados por las fuentes del catálogo sincronizado, no zonas de peligro ni predicciones.</p>
    </div>
    <FilterBar />
    {error && <p role="alert" className="rounded-lg border border-rose-400 p-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
    <section className="overflow-hidden rounded-2xl border border-border-ui bg-panel shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-ui p-4">
        <h2 className="flex items-center gap-2 font-semibold text-main"><MapPin className="text-accent" size={17}/> Epicentros registrados</h2>
        <span className="text-xs text-muted">{loading ? 'Consultando...' : `${dataset?.returned ?? 0} puntos visibles de ${dataset?.total ?? 0} registros`}</span>
      </div>
      {dataset?.truncated && <p className="border-b border-border-ui bg-panel-alt px-4 py-2 text-sm text-main">Vista limitada a los {dataset.returned} sismos más recientes; aplica fechas o magnitud para explorar el resto.</p>}
      <div className="relative h-[520px] w-full">
        <MapContainer center={[-9.19, -75]} zoom={5} scrollWheelZoom={false} className="h-full w-full" style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' maxZoom={17}/>
          <FitMarkers features={dataset?.features ?? []}/>
          {dataset?.features.map(feature => {
            const [longitude, latitude] = feature.geometry.coordinates;
            const event = feature.properties;
            const radius = Math.min(17, Math.max(5, 5 + (event.magnitude ?? 0) * 1.7));
            return <CircleMarker key={feature.id} center={[latitude, longitude]} radius={radius} pathOptions={{ className: 'sismo-point', weight: 2, fillOpacity: 0.5 }}>
              <Popup>
                <div className="space-y-1 text-sm">
                  <strong>{event.place || 'Ubicación no disponible'}</strong>
                  <p>Magnitud: {event.magnitude === null ? 'Sin dato' : `${event.magnitude.toFixed(1)} ${event.magnitude_type ?? ''}`}</p>
                  <p>Profundidad: {event.depth_km === null ? 'Sin dato' : `${event.depth_km.toFixed(1)} km`}</p>
                  <p>Fecha/hora Perú: {localTime(event.occurred_at)}</p>
                  <p>Fuente: {event.source_name}</p>
                  <a href={event.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-700">Ver fuente <ExternalLink size={12}/></a>
                </div>
              </Popup>
            </CircleMarker>;
          })}
        </MapContainer>
        {!loading && !dataset?.features.length && !error && <div className="pointer-events-none absolute left-1/2 top-4 z-[400] w-max max-w-[90%] -translate-x-1/2 rounded-lg bg-panel p-3 text-center text-sm text-main shadow-lg">No hay eventos para los filtros seleccionados.</div>}
      </div>
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-xs text-muted">
        <span className="flex items-center gap-2"><span className="inline-block size-3 rounded-full bg-accent"/> Tamaño del círculo proporcional a magnitud (solo referencia gráfica)</span>
        <span>Centro de vista: Perú y entorno cercano</span>
        <span>Cartografía: OpenStreetMap (atribución visible)</span>
      </div>
    </section>
  </div>;
}
