/** Mapa reutilizable de epicentros observados, no pronóstico ni mapa de impacto.
 * Sólo representa el subconjunto de la consulta SQL; informa si hay truncamiento.
 */
import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoDataset, GeoFeature } from '../../types/analytics';

function BoundsUpdater({ features }: { features: GeoFeature[] }) {
  const map = useMap();
  useEffect(() => {
    const coordinates = features
      .map(feature => feature.geometry.coordinates)
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
      .map(([lon, lat]) => [lat, lon] as L.LatLngTuple);
    if (coordinates.length === 0) { map.setView([-9.19, -75], 5); return; }
    if (coordinates.length === 1) { map.setView(coordinates[0], 7); return; }
    map.fitBounds(L.latLngBounds(coordinates).pad(0.14), { maxZoom: 8 });
  }, [features, map]);
  return null;
}

export default function EpicentersMap({ data, loading, error }: {
  data: GeoDataset | null;
  loading: boolean;
  error: string;
}) {
  const features = useMemo(() => (data?.features ?? []).filter(
    feature => Number.isFinite(feature.geometry.coordinates[0]) && Number.isFinite(feature.geometry.coordinates[1]),
  ), [data]);
  return <div>
    {error && <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
    {loading && <p role="status" className="mb-3 text-sm text-muted">Consultando puntos del catálogo IGP…</p>}
    <div className="relative h-80 overflow-hidden rounded-xl border border-border-ui sm:h-96">
      <MapContainer center={[-9.19, -75]} zoom={5} scrollWheelZoom={false} className="h-full w-full" style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' />
        <BoundsUpdater features={features} />
        {features.map(feature => {
          const [lon, lat] = feature.geometry.coordinates;
          const event = feature.properties;
          return <CircleMarker key={feature.id} center={[lat, lon]}
            radius={Math.max(5, Math.min(16, 5 + (event.magnitude ?? 0) * 1.5))}
            pathOptions={{ className: 'sismo-point', weight: 2, fillOpacity: 0.45 }}>
            <Popup>
              <div className="space-y-1 text-sm">
                <strong>{event.place ?? 'Ubicación no publicada'}</strong>
                <p>Magnitud: {event.magnitude == null ? '—' : event.magnitude.toFixed(1)}</p>
                <p>Profundidad: {event.depth_km == null ? '—' : `${event.depth_km.toFixed(1)} km`}</p>
                <p>Fecha UTC: {event.occurred_at ? new Date(event.occurred_at).toISOString().slice(0, 16).replace('T', ' ') : '—'}</p>
                <p>Fuente: IGP/CENSIS</p>
                {event.source_url?.startsWith('https://') && <a href={event.source_url} target="_blank" rel="noopener noreferrer">Fuente oficial</a>}
              </div>
            </Popup>
          </CircleMarker>;
        })}
      </MapContainer>
      {!loading && !error && features.length === 0 && <div className="pointer-events-none absolute left-1/2 top-3 z-[400] w-max max-w-[90%] -translate-x-1/2 rounded-lg bg-panel p-3 text-sm text-main shadow-md">Sin epicentros para estos filtros</div>}
    </div>
    <p className="mt-2 text-xs text-muted">
      {data ? `${data.returned.toLocaleString('es-PE')} de ${data.total.toLocaleString('es-PE')} epicentros filtrados.` : 'Mapa del catálogo IGP sincronizado.'}
      {data?.truncated ? ' Se muestran solo los más recientes; acota los filtros para ver otros registros.' : ''}
      {' '}El tamaño del símbolo ilustra magnitud, no riesgo ni intensidad.
    </p>
  </div>;
}
