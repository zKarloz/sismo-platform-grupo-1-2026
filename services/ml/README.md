# Laboratorio de Machine Learning retrospectivo

- Se ejecuta mediante `python -m app.commands.train_ml` desde `services/api`.
- Dependencias de entrenamiento separadas en `services/ml/requirements.txt`.
- Baseline, clasificación logística y regresión lineal; **solo sobre eventos pasados**.
- Rutas HTTP de lectura únicamente. Sin predicción de terremotos ni difusión de alertas.
- Véase `docs/FASE_6.md` para preparar el dataset v2, la migración y las validaciones.
