# Revisión Reportes 02 — IGP/CENSIS como fuente visible única

**Alcance aprobado:** IGP/CENSIS para nuevos informes; USGS permanece en PostgreSQL y conectores internos. Ninguna operación borra registros o migra el esquema.

## Cambios

- Se elimina el selector de fuentes de «Nuevo reporte». El servidor impone IGP/CENSIS en consultas de eventos, alertas y fuentes, incluso ante solicitudes manuales o clientes antiguos.
- Calidad y Modelos ML solo incluyen datasets con al menos un evento verificado IGP en `dataset_snapshots`, y ningún evento de otra fuente. Conjuntos sin snapshots verificables o mixtos no se etiquetan como IGP. Si no hay coincidencias, la API devuelve HTTP 422 con explicación.
- Cada nuevo manifiesto `report_exports.filters` conserva `source: IGP/CENSIS` y `source_policy: igp_only`. El historial público muestra los nuevos reportes IGP y los antiguos con fuente IGP explícita; oculta manifiestos de fuente mixta, distinta o desconocida, **sin borrarlos** de Supabase. El contador y la paginación siguen coincidiendo con el subconjunto visible.
- CSV/XLSX/PDF nuevos identifican IGP/CENSIS y el corte UTC sin mencionar USGS ni «V2». Los PDF presentan gráficos descriptivos cuando los datos son suficientes: magnitudes (eventos), cantidad de filas por dataset (calidad), experimentos por algoritmo (modelos) y alertas por estado. No se comparan métricas incompatibles ni se promete predicción de sismos.
- La tabla ahora representa el `status` real con colores semánticos. Se preservan los modales compartidos, paginador de 5/10/20, permisos, SHA256, descargas en memoria y paleta global.

## Verificación local

```bash
# Terminal 2: frontend
cd apps/web && npm run build && npm run dev

# Terminal 3: desde la raíz del repositorio
PYTHONPATH=services/api python -m pytest tests/backend/test_reportes_igp_only.py tests/backend/test_phase8_reports.py tests/backend/test_phase8_export_consistency.py -q
node --test tests/frontend/reportes-igp-unico.test.cjs
```

Para comprobar SQL y procedencia real en Supabase, generar un informe IGP por tipo en CSV, XLSX y PDF y revisar fuente, registros, fecha de corte y gráfico. Probar también una petición `source: USGS` y confirmar HTTP 422. Comprobar roles autorizados y que el historial de otras fuentes quede fuera de la interfaz sin eliminarse de la base.

## Límites conocidos

- No se recrean ni almacenan PDF: el archivo se transmite directamente. La expiración `expires_at` corresponde al manifiesto y su purga continúa siendo manual.
- El nombre del reporte es proporcionado por el usuario. El sistema no añade ni presenta un número interno de versión «V2» en títulos o plantillas de nuevos archivos.
- La verificación de snapshots se basa en la integridad de las FK `dataset_snapshots.event_id -> seismic_events.source_id -> data_sources.id`. No se ha consultado la base real de Supabase en esta revisión.
- Los reportes históricos ocultos siguen disponibles para custodia y auditoría interna en PostgreSQL; no se cambia el contenido de descargas anteriores.
