/** Consultas de solo lectura al conector FastAPI del IGP; nunca desde React a ArcGIS. */
import type { IGPFeed, IGPFeedKind } from '../types/igp';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
export const IGP_OFFICIAL_URL = 'https://ultimosismo.igp.gob.pe/productos/reportes-sismicos';

export async function getIGPFeed(feed: IGPFeedKind, signal?: AbortSignal): Promise<IGPFeed> {
  const response = await fetch(`${API_BASE}/api/v1/igp/${feed}`, { signal });
  if (!response.ok) throw new Error(`Consulta IGP falló (HTTP ${response.status})`);
  return (await response.json()) as IGPFeed;
}

/** UTC siempre se presenta en la zona horaria de Perú; evita confusiones de fecha. */
export function peruDate(iso: string, seconds = false): string {
  return new Date(iso).toLocaleString('es-PE', {
    timeZone: 'America/Lima', dateStyle: 'short', timeStyle: seconds ? 'medium' : 'short',
  });
}

/** Detecta retrasos de la fuente o incoherencias temporales, sin inventar sismos. */
export function igpFreshnessWarning(feed: IGPFeed): string | null {
  if (feed.latest_age_hours === null) return 'La capa IGP no contiene reportes para esta consulta.';
  if (feed.latest_age_hours < -0.1) return 'La hora del último reporte es posterior a la hora de consulta; revisar fecha y zona horaria.';
  if (feed.latest_age_hours > 24) return 'El último reporte de esta capa tiene más de 24 horas. Puede existir demora de publicación; no significa ausencia de sismos.';
  return null;
}
