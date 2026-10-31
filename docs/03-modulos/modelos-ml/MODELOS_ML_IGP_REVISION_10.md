# Modelos ML — Revisión 10 (corrección de compilación TS18047)

- Se corrigen las dos referencias a `finalReport.models` en la pestaña **Comparación**.
- Se comprueba explícitamente que la respuesta de la evaluación final 2025 exista y corresponda al lote seleccionado antes de acceder a sus modelos y baselines.
- Se actualiza la prueba estática de la revisión 09 para exigir esta protección y se añaden pruebas de regresión específicas.
- **Alcance:** solo frontend, pruebas y documentación. Sin cambios en SQL, API, experimentos o resultados 2024–2025.

## Verificación

Desde la raíz del proyecto:

```bash
node --test tests/frontend/modelos-ml-*.test.cjs
cd apps/web && npm run build
```
