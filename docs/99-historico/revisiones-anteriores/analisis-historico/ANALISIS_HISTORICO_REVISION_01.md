# Análisis histórico — Revisión 01

## Alcance

- Un solo gráfico visible y una sola consulta estadística por selección (serie temporal, histograma o dispersión).
- Los botones **Filtros**, **Actualizar** y **CSV** quedan alineados a la derecha; Filtros reutiliza el modal común.
- Se reutiliza **AppliedFiltersAside** del Dashboard (244 px en pantallas XL) con período, zona, magnitud, profundidad y origen IGP/CENSIS.
- El lateral presenta tamaño de muestra, conjunto filtrado, datos faltantes pertinentes, posible truncamiento de dispersión y hora de consulta en Perú.
- FastAPI restringe **las tres rutas de agregación analítica** a IGP/CENSIS incluso si el cliente envía `source=USGS`; el CSV ya utiliza `source=IGP/CENSIS` desde FilterBar.
- Se conservan los componentes Recharts, el botón CSV y el contexto de filtros existentes. No se necesitan cambios SQL.

## Integridad / límites

- Los gráficos utilizan la tabla operativa `seismic_events` sincronizada; **no consultan automáticamente** el catálogo histórico instrumental IGP de 1960–2025.
- El conteo por región no se incluye porque la tabla de eventos carece de un campo normalizado de departamento. Inferirlo libremente de `place` sería inexacto.
- En la dispersión, si hay más de 500 filas válidas, el gráfico muestra una muestra de los registros más recientes. Su tamaño y el total elegible se presentan por separado.
- La categoría del histograma «Sin dato» cuenta magnitudes ausentes. Para la serie temporal, `occurred_at` es obligatorio, por lo que no faltan fechas de evento persistidas.
- El CSV exporta los **eventos filtrados**, no las agregaciones del gráfico.

## Verificación

```bash
PYTHONPATH=services/api python -m pytest tests/backend/test_analytics_api.py -q
node --test tests/frontend/analisis-historico-revision-01.test.cjs
cd apps/web && npm run build
```

Comprobar en navegador los temas claro/oscuro y el panel lateral en móvil y escritorio. No se ha hecho despliegue.
