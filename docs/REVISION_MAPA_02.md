# Revisión 02 — Mapa sísmico (sección 6.3 del plan)

**Alcance:** Mapa exclusivamente IGP/CENSIS; no modifica históricos USGS, dataset ML, alertas ni Supabase. No hay migraciones.

## Requisitos cubiertos

- **Área, coordenadas y radio:** modal de filtros compartido con Dashboard, con opciones sin delimitación, rectángulo WGS84 o centro (latitud/longitud) + radio en km. No se pueden combinar rectángulo y radio. Filtros validados por FastAPI y aplicados en SQL de forma homogénea a resúmenes, gráficos y GeoJSON. El radio usa la fórmula de semiverseno con radio medio terrestre 6.371,0088 km; es una aproximación geodésica, no un contorno de peligro. En pantalla se dibuja el área de consulta con línea discontinua.
- **Período:** conserva el mes civil actual de `America/Lima` como valor inicial. Al cambiar el período, mapa y métricas siguen los filtros compartidos.
- **Magnitud:** límites mínimo/máximo anteriores, junto con leyenda por rangos. Los tamaños de los símbolos son descriptivos, no escalas oficiales de peligro.
- **Capa activa:** selector de OpenStreetMap o fondo neutro sin teselas; la selección se indica bajo el mapa. OpenStreetMap es un proveedor de fondo cartográfico, no una fuente sísmica.
- **Agrupación:** agrupación dinámica de puntos cercanos por celdas proyectadas (58 px), recalculada al cambiar zoom, sin instalar nuevas dependencias. Pulsar un grupo amplía el mapa; la ficha de un evento se puede abrir desde el grupo o desde la lista accesible paginada.
- **Fuente y actualización:** IGP/CENSIS como única fuente sísmica visible. Se distingue hora local de consulta del usuario y última ingesta IGP registrada en Supabase. No se informa una latencia oficial del proveedor que no esté medida.
- **Detalle:** conserva el popup automático del epicentro al navegar desde Dashboard e incluye coordenadas y enlace oficial si lo proporciona el registro.

## Criterios de aceptación

1. Cargar Mapa sísmico sin filtros explícitos: solo eventos IGP del mes actual de Perú; la capa de Leaflet no cubre modal ni sidebar móvil.
2. Aplicar centro `-12.04`, `-77.03` y radio `100 km`: únicamente epicentros dentro del círculo; mismo recuento en `/dashboard/summary`, `/analytics/timeseries`, `/analytics/magnitudes` y `/events/geojson` con iguales filtros y fuente.
3. Alternar radio/rectángulo: el modal envía un único modo y el backend rechaza combinaciones o radios inválidos (422).
4. Alejar/acercar: se agrupan o separan marcadores; no hay recuentos falsos y un epicentro enfocado desde Dashboard mantiene abierta su ficha.
5. Alternar OpenStreetMap y Sin mapa base: controles visibles, texto de capa activa actualizado, atribución OSM intacta cuando se utiliza.
6. Comprobar leyenda, fecha de consulta, ingesta, fuente y mensajes sobre la naturaleza exclusivamente observacional del mapa.
7. En móvil y con teclado, utilizar la lista paginada de epicentros; comprobar popups y navegación.
8. Si hay más de 1.000 puntos en el período, el mapa indica el límite de muestra y no se presenta como catálogo completo.

## Pruebas realizadas en copia aislada

- Backend: 6 pruebas aprobadas (4 regresiones existentes de Dashboard/geo + 2 nuevas de radio SQL, validación 422).
- Frontend: 4 pruebas de funciones puras de agrupación y leyenda con `node --test`.
- Análisis sintáctico TS/TSX sin errores; falta **compilación completa `npm run build`** en el repositorio del usuario y validación visual del mapa en navegador.

## Limitaciones pendientes / seguimiento

- El mapa muestra como máximo 1.000 eventos sincronizados en la ventana, por contrato previo del endpoint. Para ventanas grandes, acotar período y zona.
- El radio es una aproximación esférica adecuada para búsqueda descriptiva; no sustituye cálculos geodésicos profesionales para geofencing crítico.
- La referencia temporal de última ingesta procede del estado almacenado del conector IGP, no de una marca de publicación oficial de cada evento.
- El CSV de exportación usa el filtro geográfico compartido. Validar también roles/permisos con la suite completa del repositorio.
