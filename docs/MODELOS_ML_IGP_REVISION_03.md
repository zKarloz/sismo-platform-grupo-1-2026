# Modelos ML IGP — Revisión 03: corrección TS18047

## Alcance

- Corrige el error de compilación `TS18047` en `apps/web/src/modules/modelos-ml/Page.tsx`.
- `predictionResult` puede ser `null` durante la solicitud asíncrona. Ahora se comprueba su existencia y se verifica que `experiment_id` coincida con el modelo seleccionado antes de acceder a `items`.
- Mantiene la protección contra pares pertenecientes a otro experimento y el arreglo vacío durante la carga.
- No altera los ocho experimentos, los 4.448 pares de validación 2024, las métricas, FastAPI ni la base de datos. No se usa 2025.

## Instalación y pruebas

1. Extraer `parche-modelos-ml-igp-03-fix-ts18047.zip` en la raíz del repositorio, después de Revisión 02.
2. Ejecutar `node --test tests/frontend/modelos-ml-null-predicciones-03.test.cjs` en la raíz.
3. Ejecutar `cd apps/web && npm run build` para verificar TypeScript y Vite con las dependencias completas del proyecto.

Esta revisión no necesita migraciones ni repetición del entrenamiento/backfill.
