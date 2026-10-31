# Modelos ML — Revisión 01 (IGP histórico)

**Objetivo.** Implementar cuatro experimentos supervisados retrospectivos sobre el dataset IGP `igp_instrumental_2019_2024_m40` v1. El dataset ya fue creado por el operador (UUID `3e00e137-22dd-470e-ae22-3b348f058c4f`; SHA-256 `33597d32cc878f5210727439d3cf3c6284a52b85609bbfa6368a33a03a68815b`). El catálogo USGS anterior permanece archivado; la API de Modelos ML solo expone experimentos IGP.

## Validaciones y seguridad

- Origen obligatorio IGP/CENSIS, `dataset_kind=igp_instrumental_xlsx`, M ≥ 4.0; integridad SHA-256 y conteo del snapshot, igualdad de `split`, años UTC y filas físicas del archivo.
- **Entrenamiento 2019–2023 (2.449); validación 2024 (556)**. Los modelos nunca leen datos de 2025; esa prueba final sigue reservada. Tampoco consultan `seismic_events` ni el catálogo operativo 2026.
- Sin API para entrenar; CLI local con `--check-only` (solo validación) y `--commit` (ocho resultados en una transacción). No se serializan modelos inseguros ni se crean alertas.
- Cuatro algoritmos y sus cuatro baselines; ocho filas por corrida en `ml_experiments`, vinculadas a un mismo `batch_id`, `dataset_sha256`, semilla y parámetros.
- `StandardScaler` para KNN dentro de `Pipeline` ajustado solamente a train. RF `class_weight='balanced'`. No se usa SMOTE.
- **Nota KNN:** se utilizan dos clases (≤60 km, >60 km) por la escasez de eventos profundos (>300 km); la segunda clase agrupa intermedios y profundos sin generar eventos artificiales.
- RF: tres clases instrumentales de magnitud (`M 4.0–4.49`, `M 4.5–4.99`, `M ≥ 5.0`); el conteo de eventos anteriores considera solo sismos M≥4 del snapshot ocurridos en los **siete días previos** al evento, con empates de hora excluidos. No es una frecuencia sísmica completa ni un pronóstico.
- Métricas: MAE/RMSE/R² (regresión) y accuracy/F1 macro, precision/recall/F1 por clase, matriz de confusión (clasificación). Las curvas real-vs-estimada contienen hasta 120 muestras de **validación 2024**. Se comparan métricas únicamente con el baseline del mismo objetivo/corrida.
- Las ocho configuraciones son **pilotos de parámetros fijos**, todavía sin selección de hiperparámetros en validación. `2025` permanece totalmente reservado. La aprobación formal de datasets y la publicación de estimaciones (sección 6.7) quedan pendientes.

## Instalación

1. Instalar archivos del parche desde la raíz del repositorio.
2. Supabase SQL Editor: ejecutar `database/migrations/ML_IGP_01_OBJETIVOS.sql` **después de `003_ml_experiments.sql`**. Migración aditiva: conserva los registros USGS y amplía las restricciones de objetivos.
3. En `services/api`, con `DATABASE_URL` configurada, ejecutar:
   ```bash
   python -m app.commands.train_igp_ml --dataset-id 3e00e137-22dd-470e-ae22-3b348f058c4f --check-only
   ```
4. Con las particiones verificadas, instalar dependencias locales si faltan: `pip install -r ../ml/requirements.txt` y ejecutar **explícitamente**:
   ```bash
   python -m app.commands.train_igp_ml --dataset-id 3e00e137-22dd-470e-ae22-3b348f058c4f --commit
   ```
5. Reiniciar FastAPI y Vite; abrir `Modelos ML` (Experimentos / Comparación / Estimaciones). Los botones Filtros/Actualizar/CSV se ubican a la derecha. El CSV es de filas **visibles** y el gráfico de Comparación es uno a la vez.

## Pruebas realizadas en entorno aislado

- Pruebas unitarias backend con SQLite y datos sintéticos; sin conexiones a Supabase.
- Captura original XLSX verificada: **3.005 filas**, mismos SHA-256 reportados, entrenamiento y validación correctos.
- Los cuatro modelos y cuatro baselines ejecutaron con datos reales del XLSX en una DB SQLite temporal, sin escribir en Supabase.

### Métricas preliminares de validación 2024 (no prueba final)

| Modelo | Baseline | Modelo | Indicador |
|---|---:|---:|---|
| Regresión simple magnitud | 0.321691 | 0.318007 | MAE (menor mejor) |
| Regresión múltiple profundidad | 48.127924 | 33.697949 | MAE km (menor mejor) |
| KNN binario | 0.367463 | 0.866352 | F1 macro (mayor mejor) |
| Random Forest magnitud | 0.280556 | 0.402715 | F1 macro (mayor mejor) |

Random Forest obtiene **accuracy 0.611511**, inferior a su baseline **0.726619**; conservar y mostrar ambos resultados. Estas métricas dependen de la selección M≥4 y la versión del catálogo. Son experimentales: no sirven para anticipar sismos.

**Pendiente:** verificar migración real en Supabase, compilar frontend local, ejecutar `--check-only` y luego `--commit`, revisar seguridad de despliegue y diseñar la evaluación final de 2025 por separado.
