# Modelos ML IGP — Revisión 04: comparación visual

## Cambios

- Añade una tabla comparativa de todos los modelos no baseline de la corrida elegida. Cada uno se compara exclusivamente con el baseline del mismo objetivo, sin combinar métricas de tareas diferentes.
- Para regresión presenta MAE (menor es mejor); para clasificación F1 macro (mayor es mejor). La diferencia favorable está definida como `baseline − modelo` (MAE) o `modelo − baseline` (F1 macro).
- Incluye R² o accuracy como métricas secundarias para no ocultar, por ejemplo, una disminución de accuracy en Random Forest.
- El botón **Ver gráfico** selecciona el modelo y carga sus predicciones 2024, sin mostrar dos gráficos a la vez.
- El CSV de Comparación únicamente se habilita cuando existen predicciones individuales reales de ese experimento. Evita exportar accidentalmente métricas de toda la corrida cuando falla la lectura de los pares.

## Integridad y alcance

Solo modifica la presentación React. Conserva los ocho experimentos, 4.448 predicciones guardadas, las métricas de validación, la API y los datos. **No usa 2025** ni envía alertas. No requiere migración ni nuevo entrenamiento.

## Validación

Desde la raíz del proyecto:

```bash
node --test tests/frontend/modelos-ml-igp-01.test.cjs tests/frontend/modelos-ml-predicciones-02.test.cjs tests/frontend/modelos-ml-null-predicciones-03.test.cjs tests/frontend/modelos-ml-comparacion-04.test.cjs
cd apps/web && npm run build
```

El build completo requiere las dependencias del proyecto local.
