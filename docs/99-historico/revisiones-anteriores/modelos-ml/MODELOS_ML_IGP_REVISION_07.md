# Modelos ML · Revisión 07: prueba final independiente 2025

- Se conserva la corrida de ocho experimentos IGP y los 4.448 pares de **validación 2024**.
- Migración numerada `012_ML_IGP_03_PRUEBA_FINAL_2025.sql`: conjuntos congelados y métricas finales inmutables, sin alterar `seismic_events` ni alertas.
- CLI `evaluate_igp_2025 --check-only`: comprueba la corrida y aprobación humana del snapshot IGP. **No abre el Excel de 2025 ni evalúa métricas**.
- CLI `--commit`: requiere que `dataset_reviews` registre `approved` para el SHA exacto; reproduce las métricas/versión/parámetros de validación 2024, reajusta modelos con los 3.005 registros del desarrollo 2019–2024 usando parámetros fijos y evalúa UNA sola vez los registros 2025 M ≥ 4.0 del XLSX con SHA verificado.
- Controles: una sola prueba final por dataset; transacción completa, SHA-256 del holdout, filas IGP 2025 congeladas, sin tuning sobre 2025 ni alteración de modelos históricos. Repetir el mismo `--commit` no reevalúa ni reescribe.
- FastAPI `GET /api/v1/ml/final-evaluations?batch_id=...`: exclusivamente lectura del reporte almacenado, con verificación del hash. React: resumen en **Modelos ML → Comparación** junto a la validación 2024, solo después del registro real.
- **Interpretación**: evaluación retrospectiva de atributos de eventos ya registrados, no predicción del momento de un próximo terremoto. 2025 queda comprometido como prueba final tras su única evaluación; sus resultados no se deben usar para reoptimizar modelos.
- La aprobación `011` es posterior a los entrenamientos de desarrollo: no se reescribe la historia de esa decisión.
- **Alcance de seguridad**: no existe endpoint que entrene ni que publique resultados como alertas oficiales.

## Ejecución

1. Aprobar el dataset `igp_instrumental_2019_2024_m40` v1 desde Calidad y datasets → Trazabilidad, con justificación real (si todavía figura pendiente).
2. Aplicar migración SQL `012_ML_IGP_03_PRUEBA_FINAL_2025.sql` en Supabase.
3. `cd services/api` y `python -m app.commands.evaluate_igp_2025 --batch-id 52f16ea7-f552-4087-b9ca-aa937fde3e9f --check-only`.
4. Revisar que `approved=true`, `can_commit=true`, `year_2025_opened=false`.
5. Una vez aceptada la decisión definitiva de prueba: repetir el comando sustituyendo `--check-only` por `--commit`.
6. Reiniciar backend, comprobar `/api/v1/ml/final-evaluations` y compilar `apps/web`.

**Nota**: la prueba final es deliberadamente irreversible. No se recomienda ejecutar `--commit` hasta completar la revisión metodológica y confirmar que los cuatro modelos son la selección definitiva.
