# Fase 3 — Cierre de ingesta y catálogo de eventos

**Fecha de validación:** 22 de octubre de 2026 (Perú, UTC−05:00)  
**Estado:** Completada para el MVP local; quedan pendientes operativos para producción.

## Alcance implementado

- Consulta a USGS para eventos reales, con filtros de fecha, magnitud y rectángulo geográfico aproximado de Perú.
- Normalización y persistencia en Supabase PostgreSQL de eventos con identificador y trazabilidad de fuente.
- Ingesta idempotente por `(source_id, external_id)`; registro de ejecuciones en `ingestion_runs`.
- API FastAPI para eventos y fuentes; módulos React **Eventos** y **Fuentes de datos** conectados a la API.
- Sin predicción sísmica ni emisión de alertas oficiales.

## Evidencia validada por el desarrollador

- `pytest`: **11 passed**, 1 advertencia de compatibilidad en `TestClient` (no bloqueante).
- `npm run build`: **correcto** (Vite compiló 1605 módulos).
- Primera ingesta de 7 días, magnitud mínima 2.5: **1 visto, 1 nuevo, 0 actualizados, 0 sin cambios**.
- Segunda ingesta: **1 visto, 0 nuevos, 0 actualizados, 1 sin cambios**; no se duplicó el evento.
- Advertencias `SAWarning` de UUID: **corregidas** y no reaparecen.
- `GET /api/v1/events`: **1 evento** de USGS (`us6000u2xt`), magnitud 4.2, profundidad 35 km, al sur de Camaná.
- `GET /api/v1/sources`: USGS **active** y última ejecución **success**.
- Módulos de **Eventos** y **Fuentes**: muestran el evento, su fuente, sus fechas y las métricas de sincronización; la hora se presenta en zona horaria peruana.

## Límites y pendientes

1. `sync_interval_minutes = 5` es una configuración; **no existe aún ejecución programada cada cinco minutos**. Incorporar un job confiable al desplegar en Render.
2. Los datos mostrados dependen de la cobertura de USGS y de un rectángulo que incluye mar y países vecinos; no equivalen a un catálogo exhaustivo de Perú. Evaluar el catálogo IGP después.
3. Comprobar los términos de atribución y reutilización antes de publicación pública.
4. Mantener la ingesta como comando administrativo hasta implementar autenticación y autorización. Validar despliegue en Render/Vercel posteriormente.
5. La advertencia de deprecación de Starlette se resolverá cuando se actualicen de forma compatible las dependencias de pruebas.

## Siguiente fase

**Fase 4 — Dashboard, mapa y análisis descriptivo.** Empezar por una consulta histórica configurable para tener suficientes registros, luego implementar indicadores, GeoJSON/mapa y series e histogramas; mostrar siempre período, tamaño de muestra, fuente y fecha de actualización. Nunca presentar gráficos como pronósticos.
