# Fase 3 — Validación técnica (22/10/2026)

## Evidencia de ejecución comunicada por el usuario

- Backend: `11 passed, 1 warning in 0.97s`.
- Primera ingesta USGS: vistos 1, nuevos 1, actualizados 0, sin cambios 0.
- Segunda ingesta USGS: vistos 1, nuevos 0, actualizados 0, sin cambios 1.
- Frontend: `tsc -b && vite build`, compilación finalizada correctamente en 5.32 s.
- Ingesta idempotente: confirmada para el evento sincronizado.

## Corrección de advertencias

`app/db/tables.py` declara `server_default=text("gen_random_uuid()")` para las claves primarias de `data_sources`, `ingestion_runs` y `seismic_events`. No cambia el esquema: la migración SQL inicial ya usa el mismo `DEFAULT gen_random_uuid()`. Permite que SQLAlchemy reconozca que PostgreSQL genera el UUID.

La advertencia de Starlette/httpx en pruebas no bloquea el funcionamiento; revisar al actualizar dependencias, sin instalar paquetes de reemplazo sin comprobar compatibilidad.

## Pendiente de validación para cierre completo

- Confirmar `GET /api/v1/events` y `GET /api/v1/sources` con datos reales en navegador.
- Confirmar interfaz `http://127.0.0.1:5173/eventos` y `http://127.0.0.1:5173/fuentes-datos` con registros reales.
- Automatización de sincronización, autenticación y despliegue quedan fuera de esta prueba local.
