# Mapa sísmico — Foco temporal desde Eventos sísmicos

## Motivo
Al abrir un sismo desde la columna **Ver en el mapa**, `igp_event` permanecía en la URL después de cerrar la ficha. Cuando React/Leaflet actualizaba el mapa, el popup y el foco podían restaurarse involuntariamente.

## Solución
- El parámetro `igp_event` sirve para **enfocar el evento inicial**; no bloquea el mapa en ese punto.
- Cerrar el popup con **X**, pulsar **Quitar selección**, hacer clic fuera del popup, arrastrar, usar zoom (rueda, botones o teclado) o escoger otro epicentro libera el foco inicial y retira `igp_event` de la URL mediante `replace`.
- Las acciones dentro de la ficha no se interceptan: su botón X utiliza el evento `popupclose` de Leaflet.
- La selección de otro epicentro reemplaza el ID anterior, y el cierre asíncrono de un popup antiguo no cancela la nueva selección.
- No se utiliza `zoomstart` ni `moveend` para detectar intención humana: el propio código de Leaflet puede dispararlos durante el encuadre inicial.
- Se mantienen filtros, leyenda, capas, clústeres y acceso a la lista de epicentros.

## Archivos
- `apps/web/src/modules/mapa-sismico/Page.tsx`
- `tests/frontend/mapa-foco-navegacion-01.test.cjs`

## Validación
Ejecutar `node --test tests/frontend/mapa-foco-navegacion-01.test.cjs tests/frontend/eventos-unificacion-03-detalle-mapa.test.cjs` y `cd apps/web && npm run build`. Validar además en navegador (especialmente móvil) cerrar la ficha, cambiar de epicentro, hacer zoom y arrastrar.

Solo frontend: sin cambios en FastAPI, Supabase ni GitHub Actions.
