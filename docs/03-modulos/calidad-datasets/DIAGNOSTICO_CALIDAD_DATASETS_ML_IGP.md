# Diagnóstico — Calidad y datasets / Modelos ML con IGP

**Fecha:** 27 de octubre de 2026. **Estado:** revisión técnica, sin cambios en el código ni en Supabase.

## Evidencia revisada

- ZIP `revision-calidad-datasets-modelos-ml.zip`: frontend React, FastAPI, laboratorio, comandos, migraciones SQL 001–003, pruebas y documentación fases 5–6.
- Esquema de columnas de `dataset_snapshots`, `datasets` y `ml_experiments` aportado en la conversación.

## Hallazgos críticos

1. `app/ml/laboratory.py` rechaza cualquier snapshot con `source_name != 'USGS'`, y las limitaciones y metadatos de entrenamiento especifican USGS. **El laboratorio no admite IGP en su estado actual.**
2. `app/quality/service.py` acepta filtros sin fuente obligatoria; `app/routes/quality.py` tampoco restringe la consulta a IGP. El informe de calidad puede mezclar fuentes; la lista de datasets no tiene filtro de origen.
3. `dataset_snapshots.event_id` referencia `seismic_events`; el histórico IGP 1960–2025 no puede usarse automáticamente si reside fuera de esa tabla. `datasets.row_count` limita snapshots a 5000 registros. Revisar volumen y política de muestreo antes de importar.
4. `ml_experiments.target_name` está restringido por CHECK a `magnitude_range_observed` o `magnitude_observed`, con correspondencia fija por tipo. Modelos con `depth_km` o `depth_class` como objetivo necesitan migración aditiva y adaptación de API/tipos.
5. El laboratorio implementa DummyClassifier, LogisticRegression, DummyRegressor y dos regresiones lineales sobre magnitud. No implementa KNN ni Random Forest, ni predicciones individuales persistidas para curvas real-vs-estimado.
6. Las tablas revisadas no contienen aprobación formal de dataset, responsable, cadena detallada de transformaciones, ni publicación/revisión de estimaciones experimentales (sección 6.7).
7. Se usan snapshots reproducibles por contenido SHA-256, holdout temporal, imputación/estandarización dentro de Pipeline, métricas de clasificación y regresión. Esas bases deben conservarse.
8. La documentación anterior de Fase 5 menciona dataset USGS de 35 registros y la de Fase 6 indica entrenamiento real pendiente en esa fecha. No asumir que representan el estado actual de Supabase: consultar conteos reales.

## Experimentos propuestos

| Experimento               | Objetivo                       | Entradas                                              | Condición                                                                                      |
| ------------------------- | ------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Regresión lineal simple   | Magnitud observada             | Profundidad                                           | Correlación retrospectiva, tipo de magnitud documentado                                        |
| Regresión lineal múltiple | Profundidad observada          | Latitud, longitud                                     | Baseline separado, exclusión de profundidad de X                                               |
| KNN                       | Clase de profundidad observada | Latitud, longitud                                     | Definir umbrales de profundidad; StandardScaler ajustado solo en train                         |
| Random Forest             | Clase de magnitud observada    | Latitud, longitud, profundidad, hora, conteo anterior | Conteo calculado solo con pasado; probar también versión sin conteo, sin prometer anticipación |

## Salvaguardas

- Fuente IGP/CENSIS obligatoria **en la API, creación del dataset, snapshots y entrenamiento**, no solo en las etiquetas de React.
- Conservar los experimentos USGS existentes como evidencia histórica; no reetiquetarlos ni mezclarlos en nuevas comparaciones IGP.
- Recuento real de filas, nulos, tipos de magnitud, proporción por clase y cobertura temporal antes de fijar muestras o umbrales.
- Igual corte temporal para los modelos comparables; separación adicional o validación temporal en ventanas cuando haya volumen suficiente; imputación y escalado solo sobre train.
- Baseline por **cada target** y métricas separadas por tarea/objetivo. Accuracy nunca sola; reportar macro-F1, recall por clase, matriz y soporte; MAE/RMSE/R² en regresión.
- No crear estimaciones futuras ni probabilidades sin calibrar; resultados exploratorios sujetos a revisión y con incertidumbre/limitaciones, sin activar alertas.
- Separar operacionalmente `seismic_events` (sincronizado) del catálogo instrumental IGP 1960–2025, y registrar el origen exacto del dataset.

## Orden sugerido

1. Inventario SQL de fuentes y snapshots realmente disponibles; validar tablas y calidad.
2. Calidad y datasets: IGP-only, versión, vista previa, filtros/modal, trazabilidad y aprobación explícita (migración si se necesitan nuevos estados).
3. Migración aditiva de tipos de objetivo; refactor del laboratorio a experimentos por target, baselines, KNN y Random Forest.
4. Ejecutar `--check-only`, luego entrenamiento local verificado con dataset IGP, almacenando métricas y versión; conservar hashes.
5. Modelos ML: pestañas Experimentos/Comparación/Estimaciones, métricas visuales con un gráfico a la vez, tablas paginadas y CSV filtrado.
6. Validación integral y documentación de decisiones, incluyendo limitaciones de no predicción.

No se han ejecutado entrenamientos ni migraciones sobre Supabase en esta revisión.
