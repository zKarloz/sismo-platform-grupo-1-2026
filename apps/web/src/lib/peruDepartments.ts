/** Departamentos peruanos y prueba espacial descriptiva sobre límites INGEMMET.
 * Coordenadas GeoJSON en el orden [longitud, latitud]. No son zonas de impacto.
 */
export const PERU_DEPARTMENTS = [
  ['AMAZONAS', 'Amazonas'], ['ANCASH', 'Áncash'], ['APURIMAC', 'Apurímac'],
  ['AREQUIPA', 'Arequipa'], ['AYACUCHO', 'Ayacucho'], ['CAJAMARCA', 'Cajamarca'],
  ['CALLAO', 'Callao'], ['CUSCO', 'Cusco'], ['HUANCAVELICA', 'Huancavelica'],
  ['HUANUCO', 'Huánuco'], ['ICA', 'Ica'], ['JUNIN', 'Junín'],
  ['LA LIBERTAD', 'La Libertad'], ['LAMBAYEQUE', 'Lambayeque'], ['LIMA', 'Lima'],
  ['LORETO', 'Loreto'], ['MADRE DE DIOS', 'Madre de Dios'], ['MOQUEGUA', 'Moquegua'],
  ['PASCO', 'Pasco'], ['PIURA', 'Piura'], ['PUNO', 'Puno'],
  ['SAN MARTIN', 'San Martín'], ['TACNA', 'Tacna'], ['TUMBES', 'Tumbes'],
  ['UCAYALI', 'Ucayali'],
] as const;

export type Coordinate = [number, number];
export type DepartmentGeometry =
  | { type: 'Polygon'; coordinates: Coordinate[][] }
  | { type: 'MultiPolygon'; coordinates: Coordinate[][][] };
export type DepartmentBoundary = {
  department: string;
  features: Array<{ type: string; geometry: DepartmentGeometry; properties?: Record<string, unknown> }>;
  source: string;
  scope: string;
};
export type DepartmentBounds = { min_lat: number; max_lat: number; min_lon: number; max_lon: number };

const validNumber = (number: number) => Number.isFinite(number);

/** Devuelve la caja de consulta para SQL; el filtro EXACTO ocurre luego en el mapa. */
export function departmentBounds(boundary: DepartmentBoundary): DepartmentBounds {
  let min_lat = Infinity, max_lat = -Infinity, min_lon = Infinity, max_lon = -Infinity;
  for (const feature of boundary.features) {
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) for (const [lon, lat] of ring) {
      if (!validNumber(lon) || !validNumber(lat)) continue;
      min_lat = Math.min(min_lat, lat); max_lat = Math.max(max_lat, lat);
      min_lon = Math.min(min_lon, lon); max_lon = Math.max(max_lon, lon);
    }
  }
  if (![min_lat, max_lat, min_lon, max_lon].every(Number.isFinite)) throw new Error('Límite sin coordenadas válidas');
  return { min_lat, max_lat, min_lon, max_lon };
}

/** Cruce de rayos con inclusión de puntos en los bordes, para tolerar redondeos. */
export function pointInRing(point: Coordinate, ring: Coordinate[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-11 && x >= Math.min(xi, xj) - 1e-11
        && x <= Math.max(xi, xj) + 1e-11 && y >= Math.min(yi, yj) - 1e-11
        && y <= Math.max(yi, yj) + 1e-11) return true;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Soporta polígonos, islas y huecos interiores. */
export function pointInDepartment(point: Coordinate, boundary: DepartmentBoundary): boolean {
  for (const feature of boundary.features) {
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) {
      if (polygon.length && pointInRing(point, polygon[0])
        && !polygon.slice(1).some(hole => pointInRing(point, hole))) return true;
    }
  }
  return false;
}
