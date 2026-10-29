# Modelos ML — Revisión 09: tablas y gráficos comparables

## Alcance
- En **Comparación** se conservaron las mismas ocho columnas para **Validación IGP 2024** y **Prueba final IGP 2025**; la columna **Detalle** es más ancha, los encabezados y celdas tienen separación uniforme y «Ver gráfico» no se parte.
- En todas las pestañas se muestran nombres legibles de algoritmos; los identificadores originales continúan en Supabase, APIs y exportaciones CSV.
- «Ver gráfico» selecciona el modelo/período y desplaza al detalle. **2024:** regresión real frente a estimada por sismo, matrices y métricas por clase. **2025:** gráfico MAE/RMSE del modelo frente al baseline y matrices de confusión/métricas por clase guardadas tras la prueba final. No se inventan pares por evento para 2025: la ejecución final solo persistió métricas agregadas y matrices.
- El tooltip de los gráficos utiliza `bg-panel`, `text-main`, `border-border-ui` y respeta los temas claro y oscuro. El texto de fecha y hora mantiene contraste.
- **CSV de Comparación:** 2024 exporta pares de validación del modelo; 2025 exporta exclusivamente métricas agregadas de la evaluación final.

## Integridad
No hay cambios a FastAPI, base de datos, migraciones, modelos ni resultados de 2024/2025. Los gráficos usan únicamente las respuestas ya persistidas y consultadas por la API.

## Validación
`node --test tests/frontend/modelos-ml-*.test.cjs`

`cd apps/web && npm run build`

La suite frontend se comprobó en el montaje local; ejecutar el build completo en el repositorio con sus dependencias instaladas.
