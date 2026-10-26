# Revisión Dashboard — ciclo 2 (IGP exclusivo)

**Referencia:** Plan de Desarrollo, §6.1 (Dashboard), §11 (visualizaciones) y §13 (diseño); revisión octubre 2026.

## Implementado

1. **Un solo gráfico a la vez:** selector entre eventos por día, histograma de magnitud y mapa de epicentros. El mapa solo consulta FastAPI al seleccionarse, presenta un máximo de 1.000 puntos recientes y declara truncamiento.
2. **Zona geográfica:** filtro opcional por rectángulo WGS84 (sur, norte, oeste, este) desde el modal compartido. Los mismos predicados SQL operan en KPI, serie, histograma y GeoJSON. No representa departamentos políticos.
3. **Profundidad mediana:** cálculo exacto con ventanas SQL sobre el conjunto filtrado; se muestra junto a la media, con nulos excluidos.
4. **Avisos abiertos:** endpoint `/api/v1/dashboard/operations`; cuenta estados `pending` y `approved` solo de eventos IGP. No confundir con avisos tempranos ni sumar historial `sent`.
5. **Calidad y latencia verificables:** estado de fuente, fecha del último éxito, última ejecución, duración de ingesta, registros examinados, proporción de magnitud/profundidad y demora evento→recepción registrada del evento IGP más reciente con hora de recepción. La demora puede estar afectada por backfills y no representa SLA del IGP.
6. **Solo IGP visible:** el Dashboard fuerza `source=IGP/CENSIS`; vista de catálogo del módulo Mapa fuerza también IGP y ya no muestra texto USGS. Los registros USGS existentes y datasets ML permanecen intactos.
7. **Componentes reutilizables:** `analytics/EpicentersMap.tsx`, `ChartSwitcher.tsx`, `AppliedFiltersAside.tsx`, `FilterBar.tsx`, `ui/Modal.tsx`; no se introduce otro patrón visual.

## Matriz de cumplimiento §6.1

| Requisito | Estado | Observación |
|---|---|---|
| Período y zona | Cumple (zona rectangular) | No hay filtro por división administrativa; pendiente si se exige región nominal. |
| Total y eventos recientes | Cumple | KPI de catálogo almacenado; últimos IGP en vivo separados, sin sumarlos. |
| Distribución por magnitud | Cumple | Barra seleccionable con contraste dark del ciclo 1. |
| Profundidad media/mediana | Cumple | Cálculo SQL filtrado; no se presentan valores ficticios. |
| Última sincronización y fuentes | Cumple | Lectura de `data_sources` + `ingestion_runs`. |
| Alertas activas | Cumple con definición explícita | Avisos abiertos (pending/approved); reglas habilitadas como otro indicador. |
| Calidad/latencia | Cumple con limitaciones | Cobertura de campos y duración/recepción disponibles; no es latencia contractual del IGP. |
| Serie temporal, barras y mapa | Cumple | Una visualización a la vez, mapa muestra límite de consulta. |
| Dashboard sobrio y lateral de filtros | Cumple pendiente de QA visual | Revisión manual responsive, tema claro/oscuro, teclado y carga. |

## Validación

- **4 pruebas adicionales** en `test_dashboard_review_v2.py` aprobadas en un entorno FastAPI/SQLite aislado.
- Sintaxis/transpilación TSX de los seis archivos frontend modificados comprobada.
- No ejecutados en este entorno el `npm run build` integral ni las 150+ pruebas del repositorio original; comprobar en las terminales del proyecto.
- No requiere migración ni altera Supabase, snapshots ML, correos ni alertas.

## Pruebas funcionales antes del despliegue

1. Seleccionar un intervalo UTC y zona WGS84, por ejemplo sur `-16`, norte `-10`, oeste `-80`, este `-72`; verificar igualdad de totales en visualizaciones y KPI (mapa puede estar limitado a 1.000).
2. Alternar entre línea, barras y mapa. Nunca deben verse dos visualizaciones simultáneas.
3. Revisar fecha y filtros en lateral; popup de mapa, contraste de barra en tema oscuro, modal con Escape y teclado.
4. Verificar avisos abiertos y última ejecución con valores reales. Si faltan horas de recepción, presentar **No disponible**, no cero.
5. Confirmar ausencia de USGS en el Dashboard y en la vista catalogada de Mapa. Se revisarán otros módulos sucesivamente.

**Limitación conocida:** el XLSX oficial 1960–2025 se consulta en su módulo separado; los KPI del Dashboard proceden únicamente del IGP sincronizado en PostgreSQL, no de ese snapshot ni de la capa en vivo sumados.
