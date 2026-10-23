/** Modelo mínimo para respuesta del backend; se extenderá junto con la API. */
export type ApiHealth = { status: 'ok'; service: string; version: string };
