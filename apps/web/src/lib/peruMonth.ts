/** Período mensual peruano (UTC-05) compartido por Dashboard y Mapa.
 * Se conservan los offsets para que FastAPI compare instantes correctos y
 * el modal muestre fechas locales sin saltar al día siguiente.
 */
import type { AnalyticsFilters } from '../types/analytics';

const IGP = 'IGP/CENSIS';

export function currentPeruMonth(now = new Date()): Pick<AnalyticsFilters, 'start_time' | 'end_time'> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
  return {
    start_time: `${first}T00:00:00-05:00`,
    end_time: `${last}T23:59:59.999-05:00`,
  };
}

/** Solo agregar mes actual si el usuario aún no especificó un rango. */
export function withCurrentPeruMonth(filters: AnalyticsFilters, now = new Date()): AnalyticsFilters {
  // Las fechas vacías equivalen a ausencia de rango; extender filters primero
  // impide que campos vacíos anulen el mes por defecto.
  const dates = !filters.start_time && !filters.end_time ? currentPeruMonth(now) : {};
  return { ...filters, ...dates, source: IGP };
}

/** Fechas elegidas mediante date inputs: día civil de Perú, no medianoche UTC. */
export function peruDateFilters(start: string, end: string): Pick<AnalyticsFilters, 'start_time' | 'end_time'> {
  return {
    ...(start ? { start_time: `${start}T00:00:00-05:00` } : {}),
    ...(end ? { end_time: `${end}T23:59:59.999-05:00` } : {}),
  };
}

/** Defensa de presentación: mostrar únicamente epicentros del período consultado.
 * El filtro principal ocurre en FastAPI; esto previene solapamientos al recibir
 * datos antiguos por error y no reemplaza la validación del servidor.
 */
export function matchesPeruPeriod(occurredAt: string, filters: Pick<AnalyticsFilters, 'start_time' | 'end_time'>): boolean {
  const value = Date.parse(occurredAt);
  if (!Number.isFinite(value)) return false;
  const first = filters.start_time ? Date.parse(filters.start_time) : -Infinity;
  const last = filters.end_time ? Date.parse(filters.end_time) : Infinity;
  if (Number.isNaN(first) || Number.isNaN(last)) return false;
  return value >= first && value <= last;
}
