# Revisión del módulo Mapa sísmico — Corrección 01

**Alcance:** Mapa exclusivo IGP/CENSIS; mes peruano por defecto; modal de filtros y sidebar móvil visibles por encima de Leaflet.

## Hallazgos

- Leaflet asigna `z-index` altos a sus paneles (`tile-pane`, `overlay-pane`, popups y controles). El mapa no estaba aislado en un *stacking context*; por eso podía tapar el modal (nivel 100) y el menú móvil (niveles 30–40).
- `withCurrentPeruMonth` agregaba correctamente el mes cuando no había filtros, pero valores de fecha vacíos presentes en el objeto podían sobrescribir las fechas predeterminadas.
- No había una barrera de presentación si un backend anterior devolvía epicentros fuera del período solicitado.

## Cambios

1. `modules/mapa-sismico/Page.tsx`: mapa y contenedor con `isolate z-0`, protección de fechas sobre los puntos recibidos, fecha civil activa visible, y nota sobre el restablecimiento mensual. Se mantiene el popup automático al navegar desde los tres últimos reportes IGP.
2. `lib/peruMonth.ts`: el mes de Perú se aplica incluso cuando los campos de fecha se encuentran vacíos; los períodos explícitos se conservan. Añadida función pura `matchesPeruPeriod` para impedir que se dibujen puntos fuera del rango, sin sustituir el filtrado SQL de FastAPI.
3. Pruebas en `tests/frontend/mapa-period.test.cjs` para mes peruano, cambio UTC de mes, año bisiesto, rango personalizado, límites inclusivos y fuente IGP.

## Criterios de aceptación

- Entrar a Mapa sísmico sin filtros: muestra rango del primer al último día del mes civil vigente en Perú y solo puntos IGP de ese rango.
- Abrir **Filtros** sobre el mapa: todas las opciones del modal quedan encima de Leaflet, incluso haciendo scroll; el modal conserva su desenfoque.
- En móvil, abrir el menú lateral: cubre mapa, popups y controles; los enlaces del sidebar reciben pulsaciones.
- Aplicar otro período desde los filtros: el mapa respeta fechas personalizadas; **Limpiar** vuelve al mes actual.
- Abrir un reporte desde Dashboard: el marcador correcto se centra y muestra los detalles; si aún no existe en el catálogo mensual se identifica como reporte IGP en vivo.
- Tema claro/oscuro, anchuras 375 px y 768 px, y recarga directa de la ruta.

## Riesgos y notas

- No se cambia FastAPI, Supabase, alertas, USGS almacenado ni experimentos ML.
- Los puntos finales todavía provienen de `/api/v1/events/geojson` con filtros SQL en FastAPI; el filtrado local adicional sirve únicamente de protección visual.
- El sidebar actual tiene `z-40` y el modal compartido `z-[100]`: son suficientes frente a un mapa dentro de su propio *stacking context*. Otros mapas futuros deben conservar ese aislamiento.
- La navegación con `igp_event` puede mostrar el sismo seleccionado aunque esté fuera del período: se informa expresamente al usuario y no se suma a los indicadores.
- Validación manual de superposiciones en un navegador real obligatoria antes de subir cambios.
