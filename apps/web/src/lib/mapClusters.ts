/** Agrupación geográfica de epicentros en la proyección de pantalla de Leaflet.
 * No utiliza pesos de peligrosidad; los grupos expresan únicamente densidad visual.
 */
import type { GeoFeature } from '../types/analytics';

export type MapCluster = {
  key: string;
  latitude: number;
  longitude: number;
  events: GeoFeature[];
};

/** Semáforo de magnitudes reportadas: colores fijos en tema claro y oscuro.
 * Las bandas son descriptivas; no expresan daño, intensidad ni riesgo.
 */
export const MAGNITUDE_COLORS = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#ef4444',
  unknown: '#94a3b8',
} as const;

export type MagnitudeBand = keyof typeof MAGNITUDE_COLORS;

/** Los extremos son deliberados: M4.5 es amarillo, M5.9 amarillo, >M5.9 rojo. */
export function magnitudeBand(magnitude: number | null | undefined): MagnitudeBand {
  if (magnitude == null || !Number.isFinite(magnitude)) return 'unknown';
  if (magnitude < 4.5) return 'low';
  if (magnitude <= 5.9) return 'medium';
  return 'high';
}

export function magnitudeColor(magnitude: number | null | undefined): string {
  return MAGNITUDE_COLORS[magnitudeBand(magnitude)];
}

/** Tamaños moderados: el color es la codificación principal de la magnitud. */
export function magnitudeRadius(magnitude: number | null): number {
  const band = magnitudeBand(magnitude);
  return band === 'high' ? 10 : band === 'medium' ? 9 : 8;
}

export function magnitudeLabel(magnitude: number | null): string {
  switch (magnitudeBand(magnitude)) {
    case 'low': return 'M < 4.5';
    case 'medium': return 'M 4.5–5.9';
    case 'high': return 'M > 5.9';
    default: return 'Sin dato';
  }
}

/** Cuadrícula en píxeles mundiales proyectados por Leaflet: la pertenencia
 * a cada grupo depende de las coordenadas y el zoom, NO del punto elegido ni
 * del centro visible. Volver al mismo zoom reproduce las mismas agrupaciones.
 */
export function clusterEpicenters(
  events: GeoFeature[],
  project: (latitude: number, longitude: number) => { x: number; y: number },
  cellSize = 56,
): MapCluster[] {
  const buckets = new Map<string, { latSum: number; lonSum: number; events: GeoFeature[] }>();
  for (const event of events) {
    const [longitude, latitude] = event.geometry.coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const pos = project(latitude, longitude);
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    // Rejilla mundial fija: seleccionar y mover el mapa no alteran los grupos.
    const key = `${Math.floor(pos.x / cellSize)}:${Math.floor(pos.y / cellSize)}`;
    const bucket = buckets.get(key) ?? { latSum: 0, lonSum: 0, events: [] };
    bucket.latSum += latitude;
    bucket.lonSum += longitude;
    bucket.events.push(event);
    buckets.set(key, bucket);
  }
  // Orden canónico para evitar reordenamientos de grupos al refrescar datos.
  return [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => ({
    key,
    latitude: bucket.latSum / bucket.events.length,
    longitude: bucket.lonSum / bucket.events.length,
    events: bucket.events.slice().sort((a, b) => a.id.localeCompare(b.id)),
  }));
}
