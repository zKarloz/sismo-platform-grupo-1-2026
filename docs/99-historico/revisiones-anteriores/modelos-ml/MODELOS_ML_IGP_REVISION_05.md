# Modelos ML IGP — Revisión 05: Estimaciones retrospectivas

## Alcance

Se habilita la pestaña **Estimaciones** con lectura real de la validación **IGP 2024** (sección 6.7 del plan). No se crean nuevas predicciones, no se entrena, no se usa el holdout 2025 y no se alteran los ocho experimentos ni sus 4.448 pares de validación.

- `GET /api/v1/ml/estimates`: pagina (5/10/20), filtra opcionalmente por dataset, lote y tarea; cruza las predicciones persistidas con el snapshot histórico para recuperar fila Excel, coordenadas y fecha UTC. Filtra en **SQL** por IGP/CENSIS, tipo histórico, hash del dataset, split `validation`, intervalo UTC 2024 y `params.baseline=false`.
- React: tabla de modelo, fecha, coordenadas, observado, estimado y error/acierto; detalle en `Modal`, filtros compartidos, Actualizar y CSV **solo de la página visible**. Usa `LoadingSpinner` y `TablePagination`.
- En regresión se muestra el **error absoluto observado a posteriori**; en clasificación, si la clase fue acertada. **Ninguna de esas medidas es una incertidumbre predictiva calibrada.** Probabilidad e intervalo de predicción son `null` y se explican como no disponibles, no se inventan.
- La fecha de registro del experimento es real; **la fecha individual de cálculo no quedó registrada en el backfill**, por lo que aparece como «No registrada». No se atribuye la fecha del sismo a la fecha del cálculo.
- Estado «Sin revisión registrada» / `not_reviewed`: indicador derivado de la ausencia de un proceso persistente, **no una aprobación almacenada**. `published=false`: esta API no publica ningún pronóstico ni envía alertas. Tampoco ofrece un endpoint de escritura.
- La zona se representa como **latitud/longitud** del evento; el catálogo no contiene una delimitación administrativa validada.

## Instalación y comprobación

Instalar encima del parche 04 (requiere migración y backfill ya aplicados del parche 02). **No requiere SQL, CLI de ML ni reentrenamiento.** Reiniciar o desplegar FastAPI; reconstruir React:

```bash
PYTHONPATH=services/api python -m pytest tests/backend/test_ml_igp_historico_01.py tests/backend/test_ml_igp_predictions_02.py tests/backend/test_ml_estimates_05.py -q
node --test tests/frontend/modelos-ml-*.test.cjs
cd apps/web && npm run build
```

Endpoint de comprobación: `GET /api/v1/ml/estimates?page=1&page_size=5`. En el lote actual con **4 modelos × 556 pares** se esperan **2.224 estimaciones retrospectivas**, siempre que FastAPI acceda a la misma BD que recibió el backfill y no existan otras corridas IGP (si las hay, el total será mayor). Las 2.224 filas de baseline quedan excluidas de esta vista.

## Pendiente para implementar el apartado 6.7 completo

Una publicación real exigiría control de acceso, aprobador/fecha/estado persistidos, registro del instante de cálculo, validación adicional y una metodología de incertidumbre calibrada y auditada. **No habilitar publicación ni consumo en las reglas de alertas** hasta definir esos controles.
