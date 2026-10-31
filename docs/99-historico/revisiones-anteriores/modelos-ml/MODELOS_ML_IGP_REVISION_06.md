# Modelos ML IGP — Revisión 06: resumen útil de Estimaciones

## Objetivo

Reducir la sobrecarga de la pestaña **Estimaciones** sin eliminar predicciones individuales. Una corrida con cuatro modelos principales sobre los 556 eventos IGP de validación 2024 produce 2.224 estimaciones, **no 2.224 sismos distintos**. El total de cada módulo depende de los filtros y de los lotes guardados: nunca se fija 2.224 en la interfaz.

## Implementado

- `GET /api/v1/ml/estimates/summary` calcula desde PostgreSQL el **número de eventos únicos (dataset y fila Excel)**, total de estimaciones y total de modelos, con desglose por modelo y métrica primaria *registrada* (MAE/F1 macro). Se agregan **todos los datos válidos, no solo una página**. Se comparte exactamente el mismo predicado IGP/CENSIS, histórico, hash correcto, sin baselines, `validation` y año UTC 2024 que la lista existente.
- `GET /api/v1/ml/estimates?experiment_id=<UUID>` permite explorar los registros de un único modelo desde el servidor; sigue admitiendo dataset, corrida, tarea, página y tamaño.
- En React aparece primero una vista resumen con tres cifras y tabla corta por modelo. La lista de eventos queda **cerrada inicialmente**; «Explorar registros» la muestra, y «Ver registros» abre el detalle del modelo seleccionado. Paginación compartida de 5/10/20. Ninguna fila se borra de Supabase.
- El botón CSV, alineado a la derecha, exporta **resumen por modelo** si se ve el resumen, o **solo la página visible de registros** si se abre el detalle. Nombres de archivos diferentes; la aplicación no promete una exportación masiva de todas las filas desde un CSV de página.
- No se modifica el laboratorio, no se usan datos USGS ni el holdout 2025, no se calculan nuevas predicciones, no se inventan probabilidades, intervalos, revisiones o aprobaciones, y no se envían alertas.

## Instalación y pruebas

Extraer el ZIP desde la raíz del repositorio, **desplegar/reiniciar FastAPI** para el endpoint nuevo y reconstruir frontend. No hay migraciones, nuevos entrenamientos ni backfill.

```bash
PYTHONPATH=services/api python -m pytest \
  tests/backend/test_ml_estimates_summary_06.py \
  tests/backend/test_ml_estimates_05.py \
  tests/backend/test_ml_igp_historico_01.py \
  tests/backend/test_ml_igp_predictions_02.py -q
node --test tests/frontend/modelos-ml-*.test.cjs
cd apps/web && npm run build
```

Consulta de prueba: `GET /api/v1/ml/estimates/summary`. Con el lote informado y sin otro lote elegible, se esperan `unique_events=556`, `total_models=4` y `total_estimates=2224`. La API calcula los valores reales y puede devolver otros totales al añadir corridas.

## Pendiente para el cierre de 6.5–6.7

- **Calidad y datasets:** revisión y aprobación formal persistente de snapshots, permisos, responsable, fecha y auditoría.
- **Modelos ML:** revisión formal de estimaciones (solo si existe un flujo justificado), evaluación final ciega sobre 2025 en un proceso separado, y registro reproducible del artefacto/código y de las limitaciones.
- **Incertidumbre:** definir metodología de calibración cuando tenga sentido y haya datos suficientes; el error retrospectivo **no** es intervalo o probabilidad predictiva.
- Integración/despliegue y revisión visual móvil. No convertir estimaciones retrospectivas en alertas oficiales.
