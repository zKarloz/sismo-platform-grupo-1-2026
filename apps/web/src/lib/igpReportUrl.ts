/** Enlaces a reportes IGP individuales, nunca al portal general por evento.
 * Mantiene el contrato de identificadores del módulo Eventos sísmicos.
 */
export function individualIGPReport(externalId: string, sourceUrl?: string | null): string | null {
  // Los códigos IGP/CENSIS/RS permiten construir una dirección individual.
  const match = /^(?:IGP\/CENSIS\/RS\s*)?(\d{4}-\d{4,6})$/i.exec(externalId.trim());
  if (match) return `https://ultimosismo.igp.gob.pe/evento/${match[1]}`;

  // Los datos legados podrían contener el enlace individual en source_url.
  // No utilizar páginas generales ni dominios distintos como enlace específico.
  try {
    const url = new URL(sourceUrl ?? '');
    if (url.protocol === 'https:' && url.hostname === 'ultimosismo.igp.gob.pe' &&
        /^\/evento\/\d{4}-\d{4,6}\/?$/.test(url.pathname)) {
      return `https://ultimosismo.igp.gob.pe${url.pathname.replace(/\/$/, '')}`;
    }
  } catch { /* Fuente vacía o inválida: omitir el enlace antes que inventarlo. */ }
  return null;
}
