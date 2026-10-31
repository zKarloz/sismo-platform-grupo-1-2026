# Revisión Reportes 03 — Rangos de magnitud y fecha de corte

## Alcance

Se armonizó el reporte de **Eventos registrados** con la leyenda visual ya adoptada por el Mapa sísmico (fuente visible: IGP/CENSIS). No se alteran las consultas ni los datos de PostgreSQL.

## Cambios

- PDF: el gráfico anterior (`M2–<3`, `M3–<4`, `M4–<5`, `M5+`) fue sustituido por `M < 4.5` (verde), `M 4.5–5.9` (amarillo), `M > 5.9` (rojo) y `Sin dato` (celeste grisáceo). Se cuentan todas las magnitudes numéricas finitas y las ausentes o inválidas; no se excluyen sismos menores de M2.
- CSV, XLSX y PDF: se agrega la columna **Rango visual de magnitud** para cada evento, sin modificar la magnitud original.
- Se advierte que los colores representan un criterio visual descriptivo; **no estiman intensidad, daño ni riesgo oficial**.
- Reportes (React): la tarjeta deja de decir «Cada generación · UTC» y ahora explica que la fecha de corte **se fija al generar el reporte**. El historial conserva la fecha exacta.
- No se presentan «V2» ni USGS en los nuevos reportes sujetos a la política IGP ya implementada.
- El Dashboard tiene una gráfica con intervalos diferentes; **queda pendiente** unificarla en su revisión. Para verificar coincidencia exacta del tono HEX, cotejar en esa revisión `apps/web/src/lib/mapClusters.ts` con los códigos de `MAGNITUDE_BANDS`.

## Qué significa fecha de corte

`cutoff_at` es la fecha y hora de referencia capturada por FastAPI al solicitar un reporte, en UTC. Para eventos, la consulta contiene `received_at <= cutoff_at`; el usuario puede limitar por separado el rango de fechas en que ocurrieron los sismos. **No** es una programación automática de informes ni la última actualización del catálogo IGP.

## Validación

```bash
# Terminal 2 (apps/web):
npm run build

# Terminal 3 (raíz):
PYTHONPATH=services/api python -m pytest tests/backend/test_reportes_semaforo_magnitud.py -q
node --test tests/frontend/reportes-corte-claridad.test.cjs

# Pruebas de regresión con el repositorio completo:
PYTHONPATH=services/api python -m pytest tests/backend/test_reportes_igp_only.py tests/backend/test_phase8_reports.py tests/backend/test_phase8_export_consistency.py -q
```

Se ejecutaron 16 pruebas del nuevo módulo y 1 prueba estática del frontend. Se generó y renderizó un PDF de prueba con 9 eventos, verificando las cuatro barras y la columna de rango. Las pruebas integradas anteriores no pudieron recopilarse en el ZIP parcial debido a la falta de `services/api/app/core/config.py`. No se declara aprobado el `npm run build` completo sin ejecutar en el repositorio.

## Infraestructura

No requiere migración de Supabase, modificación de credenciales ni nuevos endpoints. Hay que actualizar el backend de Render para los nuevos CSV/XLSX/PDF y el frontend de Vercel para el texto de la tarjeta.
