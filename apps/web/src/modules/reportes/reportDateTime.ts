/** Utilidades puras para el rango temporal de Reportes.
 * Los campos datetime-local mantienen la hora local del navegador, como antes.
 */
export type ReportPeriodField = 'start_at' | 'end_at';

/** Solo cambiar de día aplica la hora inicial/final sugerida.
 * Modificar la hora dentro del mismo día nunca borra la elección del usuario.
 */
export function withDefaultReportTime(
  previous: string | undefined,
  next: string,
  field: ReportPeriodField,
): string {
  if (!next) return '';
  const day = next.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day !== previous?.slice(0, 10)) {
    return `${day}T${field === 'start_at' ? '00:00' : '23:59'}`;
  }
  return next;
}

/** Convierte la hora local a UTC para FastAPI.
 * En «Hasta» se incluyen los segundos de todo el último minuto seleccionado;
 * de otro modo 23:59:00 dejaría fuera sismos de 23:59:01 a 23:59:59.
 * PostgreSQL admite microsegundos, de modo que incluimos hasta 23:59:59.999999.
 */
export function reportLocalTimeToUtc(value: string, endOfMinute = false): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error('Fecha u hora inválida');
  timestamp.setSeconds(endOfMinute ? 59 : 0, endOfMinute ? 999 : 0);
  const iso = timestamp.toISOString();
  return endOfMinute ? iso.replace(/\.999Z$/, '.999999Z') : iso;
}
