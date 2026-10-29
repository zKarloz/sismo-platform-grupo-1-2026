# Modelos ML IGP — Revisión 02 (pares observados y estimados)

## Alcance

- Corregido TS2322 al renderizar `params.baseline` (`unknown`) mediante `=== true`.
- Migración aditiva `ML_IGP_02_PREDICCIONES.sql` de tabla `ml_validation_predictions`, FK a la fila física del Excel, validación exclusiva 2024, RLS y escritura inmutable. No modifica los ocho experimentos históricos.
- Reconstrucción CLI verificable de la corrida existente por `batch_id`. Se entrena de nuevo **solo en memoria** para reproducir predicciones, compara *todas* las métricas, hiperparámetros, versión NumPy/scikit-learn, SHA del dataset y particiones contra los registros originales. Si difiere, aborta sin guardar. No usa 2025.
- Nuevo GET `/api/v1/ml/experiments/{id}/predictions` con filtro IGP en FastAPI y hasta 1000 filas por petición. No existe POST de entrenamiento.
- En Comparación: un gráfico por modelo, hasta 120 puntos reales para la regresión, matrices de confusión, métricas por clase; vista de pares por fila, paginación de 5/10/20 y CSV con los pares de todo el modelo. Se conservan los gráficos originales almacenados en `metrics` como degradación elegante antes del backfill.
- Futuras corridas con `train_igp_ml --commit` insertan también los pares por modelo, en la misma transacción que sus ocho métricas.

## Orden de instalación

1. Extraer ZIP sobre revisiones anteriores.
2. Ejecutar `database/migrations/ML_IGP_02_PREDICCIONES.sql` en Supabase SQL Editor.
3. En `services/api`, ejecutar primero:

```bash
python -m app.commands.backfill_igp_predictions --batch-id 52f16ea7-f552-4087-b9ca-aa937fde3e9f --check-only
```

4. Solo con `metrics_match: true` y `total_pairs: 4448`, ejecutar el mismo comando con `--commit`. No reejecutar `train_igp_ml --commit` para este lote: eso registraría **otra corrida**.
5. Reiniciar FastAPI y `npm run build` en frontend.

## Validación y límites

- 2024 contiene 556 eventos, 8 experimentos × 556 = 4448 pares; prueba final 2025 excluida.
- Si cambió la versión de scikit-learn/NumPy o resultados por el entorno, el backfill aborta intencionalmente; utilizar el mismo ambiente que generó el lote, **no** modificar métricas para forzar el proceso.
- Los modelos son descriptivos retrospectivos, no alertas ni pronósticos. La pestaña Estimaciones continúa sin habilitarse.
- Validación local con SQLite y pruebas de regressión; verificación Supabase y build completo pendientes de ejecución en el entorno de despliegue.
