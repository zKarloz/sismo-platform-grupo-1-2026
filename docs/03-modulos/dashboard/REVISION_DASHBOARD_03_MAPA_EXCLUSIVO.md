# Revisión Dashboard/Mapa — ciclo 3 · IGP exclusivo

**Alcance:** Ajuste solicitado durante la revisión del apartado 6.1 del plan de desarrollo. El mapa queda exclusivo de `Mapa sísmico`; el Dashboard conserva únicamente serie temporal y distribución por magnitud, alternadas por selector.

## Cambios

1. Los dos gráficos y KPI del Dashboard consultan por defecto el **mes civil en Perú (America/Lima, UTC−05)**; el mismo valor predeterminado aplica al mapa y a su lista de epicentros almacenados. Los filtros aplicados explícitamente por el usuario prevalecen y se comparten mediante `AnalyticsProvider`.
2. El modal compartido `FilterBar` muestra fechas peruanas completas, admite región rectangular/magnitud/profundidad, y restablece el mes actual al pulsar «Limpiar» en los módulos con `currentMonthDefault`.
3. Dashboard muestra solo los **tres reportes IGP más recientes**, no sumados a los KPI. Cada fila enlaza a `/mapa-sismico?igp_event=<ID IGP>` y transporta el reporte durante la navegación.
4. Mapa consume `/api/v1/events/geojson` con `source=IGP/CENSIS` y el rango compartido. Al recibir `igp_event`, centra el mapa y abre automáticamente el **mismo popup** utilizado al pulsar un punto.
5. Si el reporte seleccionado aún no figura en el catálogo sincronizado, utiliza exclusivamente **ese evento IGP en vivo** como marcador adicional claramente identificado, sin incorporarlo al total del catálogo ni a las métricas. Si ya existe, no lo duplica.
6. Eliminado del Dashboard el renderizado y carga de mapa. Se conserva el componente reutilizable `EpicentersMap.tsx` sin cambios para evitar afectar otros módulos que puedan usarlo.

## Criterios de aceptación

- Dashboard presenta solo «Eventos por día» y «Distribución por magnitud»; no hay opción de mapa.
- En una sesión sin filtros previos, el lateral muestra del primer al último día del mes peruano vigente; los gráficos responden al mismo intervalo.
- En Mapa sísmico, el modal usa los mismos filtros; al abrir el mapa normalmente se ven solo los puntos IGP almacenados de ese mes.
- Desde cualquiera de los 3 últimos reportes, el enlace navega al mapa, centra el epicentro y abre automáticamente magnitud, profundidad, fecha, ubicación y enlace oficial.
- Si falta en Supabase, se ve el marcador IGP en vivo con aviso explícito de no estar contado en el catálogo.
- Al quitar selección, vuelve al encuadre del catálogo mensual.
- Al cambiar el período en el modal, Dashboard y Mapa siguen consultando ese rango; «Limpiar» restablece el mes actual.
- Probar con tema oscuro, móviles, sin registros y con el servicio IGP temporalmente caído.

## Pruebas efectuadas en la preparación

- Transpilación sintáctica TS/TSX de cuatro archivos modificados: correcta.
- Seis comprobaciones de fecha/mes para `America/Lima`, cruce de mes UTC, febrero bisiesto, filtros explícitos y fechas completas: correctas.
- **Pendientes en el repositorio del usuario:** `npm run build`, suite backend, revisión visual y selección automática real en Leaflet. No hay migración SQL ni modificación de USGS, ML, alertas o tablas.

**Fuente y cobertura:** IGP/CENSIS; el catálogo sincronizado y la capa reciente en vivo son productos distintos. No se ofrecen predicciones, intensidades estimadas ni alertas tempranas.
