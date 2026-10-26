# Auditoría Dashboard — Ciclo 1

**Base:** Plan de Desarrollo del Sistema de Monitoreo Sísmico ML v1.0, secciones 6.1, 11 y 13. Fecha de revisión: octubre de 2026.

## Alcance verificado

- El Dashboard original tenía cuatro tarjetas de último sismo IGP, cuatro tarjetas de catálogo, dos gráficos simultáneos, tabla reciente y filtros desplegados permanentemente: demasiados bloques para vista ejecutiva.
- `useAnalyticsFilters` iniciaba con `source: 'USGS'`; el filtro compartido permitía USGS o todas las fuentes, contrario a la política IGP exclusiva de la interfaz.
- El gráfico de barras utilizaba un tooltip sin estilos explícitos para el cursor/ítems en tema oscuro.
- No hay cálculo de profundidad mediana ni KPI de alertas en los archivos recibidos. No aparece un mapa de puntos en el Dashboard.

## Cambios del ciclo 1

1. Solo IGP/CENSIS en los filtros compartidos y en las consultas del Dashboard, sin alterar datasets ni el backend histórico USGS.
2. Tarjetas ejecutivas simplificadas, separando claramente indicadores de la base y últimos reportes en vivo (no se suman).
3. Selector de visualización: solo una serie temporal **o** un histograma por magnitud visible a la vez.
4. Panel lateral reutilizable con período UTC, fuente, rangos y tamaño de muestra; muestra que la zona todavía no es filtrable.
5. Modal común con desenfoque, `Escape`, tabulación contenida y bloqueo de desplazamiento. Los filtros compartidos se editan allí.
6. Tooltip de Recharts con fondo, texto y cursor coherentes con los tokens semánticos de tema claro/oscuro.
7. Panel compacto con datos reales de conector IGP y cobertura de magnitud/profundidad. No se presenta una latencia calculada que no existe.

## Pendientes para aprobar el apartado 6.1

| Requisito | Estado | Dependencia |
|---|---|---|
| Período, magnitud, profundidad | Implementado | Validar `npm run build` y UI |
| Región / zona | Pendiente | Verificar backend `routes/filters.py` y `routes/geo.py` |
| Total de eventos, recientes, distribución | Implementado | Verificación en producción |
| Profundidad media | Implementado | Fuente IGP |
| Profundidad mediana | Pendiente | Ampliar `dashboard/summary`, pruebas |
| Última sincronización / conectores | Parcial | Verificar `DataSource` y `runs` |
| Alertas activas | Pendiente | Revisar `routes/alerts.py` y tipos/servicios |
| Latencia de ingesta y calidad | Parcial | Cobertura de campos; faltan SLA/latencia real |
| Línea temporal / barras | Implementado, uno a la vez | UI |
| Mapa de puntos | Pendiente | Reutilizar componente Leaflet de Mapa sísmico |

**Notas:** el PDF pide un mapa de puntos y la experiencia de un único gráfico; el mapa podría integrarse como una tercera opción en el selector de visualizaciones, reutilizando el visor geográfico. La fuente histórica XLSX 1960–2025 pertenece al módulo Histórico IGP; el resumen agregado mostrado corresponde a eventos IGP almacenados. No existe una serie temporal histórica de ese XLSX en los endpoints analizados.

## Validación

Desde el repositorio completo:

```bash
cd services/api
python -m pytest ../../tests/backend -q
cd ../../apps/web
npm run build
```

Revisar modo oscuro (tooltip de barras), teclado y Escape del modal, actualización de filtros entre módulos, y ausencia de registros USGS en el Dashboard.

**Seguridad:** no se modifica la autorización ni se introducen claves. Las exportaciones CSV continúan requiriendo autenticación. No se ejecutaron migraciones SQL.
