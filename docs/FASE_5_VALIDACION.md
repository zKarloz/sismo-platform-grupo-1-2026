# Fase 5 — Evidencia de validación

**Proyecto:** Sistema de Monitoreo Sísmico V2  
**Fecha local:** 22 de octubre de 2026  
**Estado:** verificaciones automatizadas e integridad real aprobadas; pendiente inspección visual y comprobación de restricciones en Supabase.

## Resultados confirmados

| Verificación                                                                                  | Resultado                                        | Estado             |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------ |
| `python -m pytest ../../tests/backend -q`                                                     | 21 pruebas superadas; 1 advertencia de Starlette | Aprobado           |
| `create_dataset --name peru_usgs_historico --source USGS --min-magnitude 2.5 --max-rows 1000` | Versión 1, 35 registros, calidad `ok`            | Aprobado           |
| `verify_dataset --id <uuid>`                                                                  | 35 filas; conteo correcto; SHA-256 correcto      | Aprobado           |
| Consulta Supabase                                                                             | 1 versión, 35 filas congeladas                   | Aprobado           |
| `npm run build`                                                                               | Compilación correcta en 5,13 s                   | Aprobado con aviso |

La advertencia de Starlette no causó fallos. Vite advirtió sobre un bundle principal >500 kB; queda para optimización por carga diferida.

## Comprobaciones para el cierre

- [ ] Ejecutar `database/checks/002_verify_datasets.sql` en Supabase y confirmar ambas tablas (`datasets`, `dataset_snapshots`), RLS activo en ambas y los tres triggers (`datasets_immutable`, `dataset_snapshots_immutable`, `dataset_snapshots_limit_position`).
- [ ] Abrir `http://127.0.0.1:8000/api/v1/data-quality/summary` y revisar el conteo e indicadores reales.
- [ ] Abrir `http://127.0.0.1:8000/api/v1/datasets` y confirmar `peru_usgs_historico`, versión 1, 35 registros.
- [ ] Abrir `http://127.0.0.1:5173/calidad-datos`: verificar resumen de calidad y versión en temas claro y oscuro, filtros y ausencia de errores en consola.
- [ ] Comprobar que no existe una ruta pública de creación de datasets (la escritura está reservada para el comando de backend).

**Nota técnica:** las pruebas de inmutabilidad y detección de alteraciones se ejecutaron con una base aislada SQLite. La existencia de triggers en Supabase es una comprobación adicional; no se ha probado directamente una mutación rechazada sobre la base remota. No modificar manualmente registros reales solo para probarlo.

**Alcance del dataset:** contiene 35 eventos almacenados, por lo que no representa necesariamente el catálogo histórico completo del Perú. El análisis es retrospectivo, no predictivo.

## Criterio de cierre

Una vez completadas las comprobaciones pendientes, se puede marcar la Fase 5 como **cerrada** y conservar este archivo como evidencia. No es necesario crear una versión 2 solo para finalizar la fase.
