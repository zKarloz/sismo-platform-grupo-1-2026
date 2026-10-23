# Fase 6 — Machine Learning exploratorio (implementación inicial)

**Estado:** código y pruebas locales preparados; pendientes la migración 003, backfill, dataset v2 y entrenamiento real en Supabase. No declarar la fase cerrada antes de estas comprobaciones.

## Objetivo y límites

Clasificación **retrospectiva** de rangos de magnitud de eventos ya reportados y regresión lineal ilustrativa de la magnitud observada. **No predice** fecha, zona, ocurrencia, magnitud futura ni peligro sísmico. **No activa alertas**. Cualquier uso interpretativo requiere validación de un sismólogo. La procedencia USGS y la mezcla de tipos de magnitud deben mostrarse explícitamente al interpretar resultados.

## Orden de instalación y uso (Git Bash, raíz del proyecto)

1. Aplicar el ZIP. Desde `services/api` instalar dependencia científica SOLO en entorno local:

   ```bash
   source .venv/Scripts/activate
   python -m pip install -r ../ml/requirements.txt
   ```

   `services/api/requirements.txt` queda sin scikit-learn, así Render puede ejecutar solo API y lecturas de experimentos; el entrenamiento no se ejecuta en Render.

2. En Supabase SQL Editor ejecutar `database/migrations/003_ml_experiments.sql`. Después ejecutar la primera consulta de `database/checks/003_verify_ml.sql`. Debe devolver `ml_experiments | true | 1`.

3. **Ampliar el histórico**, por bloques independientes (ventana `--end` EXCLUSIVA, UTC). Desde `services/api`:

   ```bash
   python -m app.commands.backfill_usgs --start 2024-01-01 --end 2026-10-23 --min-magnitude 2.5 --chunk-days 60
   ```

   Cada bloque registra `ingestion_runs` y usa UPSERT por `(source_id,external_id)`; reintentar un bloque no duplica eventos. El rectángulo geográfico **incluye zonas de países vecinos y mar**; no es una delimitación oficial de Perú. USGS puede revisar eventos antiguos. Si un bloque falla, corregir y reejecutar; no avanzar con un histórico incompleto sin documentarlo.

4. **Crear dataset v2**, usando exactamente **el mismo nombre** que v1. Si ya existe una versión v2, la operación creará v3 (no sobrescribe):

   ```bash
   python -m app.commands.create_dataset --name peru_usgs_historico --source USGS --start 2024-01-01T00:00:00+00:00 --end 2026-10-23T00:00:00+00:00 --min-magnitude 2.5 --max-rows 5000
   ```

   Guardar el UUID que imprime. Si hay más de 5000 eventos, acotar períodos; la aplicación **no trunca silenciosamente**. Verificar:

   ```bash
   python -m app.commands.verify_dataset --id UUID_REAL
   ```

   Debe salir `Conteo OK: True` y `SHA-256 OK: True`. No alterar v1.

5. **Definir target (fijo para esta primera versión)**. La etiqueta es `magnitude_range_observed`:

   | Etiqueta experimental | Magnitud observada |
   |---|---|
   | `2.5–<4.0` | 2.5 <= M < 4.0 |
   | `4.0–<5.0` | 4.0 <= M < 5.0 |
   | `≥5.0` | M >= 5.0 |

   Las clases no son una escala oficial de peligrosidad. Las features **son solo** latitud, longitud y profundidad del evento *ya registrado*. La magnitud no aparece en `X` (es el target), ni el ID, ni campos de revisión o timestamps posteriores. La regresión lineal simple utiliza profundidad; la múltiple, latitud/longitud/profundidad. Ambas ajustan `magnitude_observed` retrospectivamente.

6. **Inspección ANTES de entrenar**. No escribe ni entrena:

   ```bash
   python -m app.commands.train_ml --dataset-id UUID_REAL --seed 42 --test-ratio 0.20 --check-only
   ```

   Ordena eventos por UTC y usa el 80 % cronológicamente más antiguo para entrenamiento y el 20 % más reciente para prueba (el número de registros de prueba se redondea hacia arriba). No divide registros con la misma marca temporal. Rechaza datasets con menos de **60** filas válidas o menos de **3** registros de alguna clase en entrenamiento. Reporta clases ausentes en test; esas métricas no son evidencia robusta. No se usa un reparto aleatorio.

7. **Entrenar y registrar** (solo tras revisar el conteo y corte):

   ```bash
   python -m app.commands.train_ml --dataset-id UUID_REAL --seed 42 --test-ratio 0.20
   ```

   Registra transaccionalmente **5** experimentos en `ml_experiments`: DummyClassifier(más frecuente), LogisticRegression, DummyRegressor(media), LinearRegression-simple, LinearRegression-multiple. Clasificación: Accuracy, Macro-F1, reporte por clase y matriz de confusión; regresión: MAE, RMSE, R². También registra `batch_id`, dataset/versión/SHA, features, semilla, hiperparámetros, versiones de librerías, conteos y períodos de train/test. El escalado y la imputación se ajustan **solo con train** (Pipeline). Sin archivo `joblib`: la ejecución se reproduce por código, dataset versionado y configuración.

8. **Comprobar endpoints y UI**:

   - `GET /api/v1/ml/experiments`
   - Vercel/local: `/modelos-ml` (comparación en una corrida y advertencias)
   - `database/checks/003_verify_ml.sql` → 5 filas después de la primera corrida.

9. **Pruebas y publicación**:

   ```bash
   python -m pytest ../../tests/backend -q
   # en apps/web:
   npm run build
   # en raíz:
   git status --short
   git add .
   git commit -m "feat: laboratorio ML retrospectivo fase 6"
   git push origin main
   ```

   Render y Vercel tomarán el nuevo código según sus configuraciones de despliegue. Ejecutar la migración antes del despliegue evita un HTTP 503 en el nuevo endpoint. No subir `.env` ni respaldos con credenciales. La instalación de paquetes científicos queda limitada al entorno local/CI, no al web service de Render.

## Riesgos conocidos

- **Tamaño/calidad/cobertura:** la completitud del catálogo USGS depende de región, magnitud y época; no equiparar conteos con tasa real de sismicidad sin analizar completitud.
- **No homogeneidad de magnitudes:** tipos `mb`, `ml`, `mwr`, etc. no son necesariamente intercambiables. Documentar mezcla antes de comparar experimentos.
- **Revisión posterior:** features extraídas de snapshots de USGS pueden haberse corregido con posterioridad a la hora del sismo; NO hay garantía de disponibilidad *punto-en-tiempo*. La marca `point_in_time_features_validated` queda en `false`. No utilizar como inferencia operativa.
- **Dependencia temporal:** sismos agrupados (incluidas réplicas) pueden hacer optimista un holdout simple. Evaluar con especialistas; opcional agregar una separación temporal con margen en una iteración posterior.
- **Clases desequilibradas:** si la clase `≥5.0` es escasa, Macro-F1, recall por clase y tamaño de muestra son imprescindibles; una accuracy elevada por sí sola no demuestra utilidad.
- **Seguridad:** `GET` permite leer métricas; entrenar/escribir solo desde CLI hasta contar con RBAC de la Fase 2. No exponer entrenamiento sin autenticar.

## Evidencia local de preparación

- 27 pruebas Python aprobadas (21 de fases anteriores + 6 de Fase 6) en un entorno de pruebas aislado.
- El backend y la sintaxis Python están comprobados; el frontend React requiere ejecutar `npm run build` en VS Code.
- No se ejecutó backfill ni migración/training contra Supabase desde este entorno, y no se validaron métricas sobre datos reales.
