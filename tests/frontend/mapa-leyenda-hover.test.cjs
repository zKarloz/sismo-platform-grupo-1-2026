/** Regresiones del mapa: los grupos se abren con clic en un Popup superior,
 * el scroll queda en la lista, y los epicentros mantienen su semáforo IGP.
 * Estos contratos estáticos complementan, no sustituyen, la prueba en navegador.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'apps/web/src/modules/mapa-sismico/Page.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'apps/web/src/modules/mapa-sismico/mapStyles.css'), 'utf8');
const globalStyles = fs.readFileSync(path.join(root, 'apps/web/src/index.css'), 'utf8');
const cluster = source.slice(source.indexOf('function ClusteredMarkers('), source.indexOf('/** Semáforo fijo'));
const epicenter = source.slice(source.indexOf('function Epicenter('), source.indexOf('function asLiveFeature('));

test('el grupo usa un Popup real con clic (no Tooltip anidado, ni hover)', () => {
  assert.match(cluster, /<Popup className="sismo-event-popup sismo-cluster-popup"/);
  assert.match(cluster, /<Tooltip permanent direction="center"/);
  assert.doesNotMatch(cluster, /showPreview|scheduleClose|mouseover:|mouseout:/);
  assert.doesNotMatch(cluster, /sismo-cluster-preview/);
});

test('panel de grupo en pane superior a números de clusters', () => {
  assert.match(styles, /\.leaflet-popup-pane\s*\{\s*z-index:\s*750/);
  assert.match(styles, /\.leaflet-tooltip-pane\s*\{\s*z-index:\s*650/);
  assert.match(styles, /\.leaflet-popup\.sismo-cluster-popup/);
});

test('grupo scroll interno sin cambiar zoom del mapa', () => {
  assert.match(cluster, /L\.DomEvent\.disableScrollPropagation\(node\)/);
  assert.match(cluster, /onWheel=\{event => event\.stopPropagation\(\)\}/);
  assert.match(styles, /overflow-y:\s*auto/);
  assert.match(styles, /overscroll-behavior:\s*contain/);
  assert.match(styles, /scrollbar-width:\s*thin/);
});

test('elegir evento en grupo acerca y luego selecciona el ID correcto', () => {
  assert.match(cluster, /function selectEventFromGroup\(feature: GeoFeature\)/);
  assert.match(cluster, /map\.flyTo\(target, focusZoom/);
  assert.match(cluster, /map\.once\('moveend', finish\)/);
  assert.match(cluster, /onSelect\(feature\.properties\.external_id\)/);
  assert.match(cluster, /selectEventFromGroup\(event\)/);
  assert.doesNotMatch(cluster, /clusterEpicenters\([\s\S]*?58,\s*selectedId/);
});

test('mantiene recuentos al seleccionar un epicentro agrupado', () => {
  assert.match(cluster, /selectedFeature && selectedInGroup/);
  assert.match(cluster, /cluster\.events\.some\(event => event\.id === selectedFeature\.id\)/);
});

test('semáforo de colores se aplica a SVG y no depende del tema', () => {
  assert.match(epicenter, /const color = magnitudeColor\(event\.magnitude\)/);
  assert.match(epicenter, /pathOptions=\{\{[^}]*color, fillColor: color/);
  assert.match(epicenter, /path\.style\.stroke = color/);
  assert.match(epicenter, /path\.style\.fill = color/);
  assert.doesNotMatch(globalStyles, /\.leaflet-overlay-pane\s+\.sismo-point\s*\{\s*stroke:\s*var\(--ui-accent\)/);
});

test('epicentros siguen abriendo una ficha individual por clic', () => {
  assert.match(epicenter, /<CircleMarker ref=\{markerRef\}/);
  assert.match(epicenter, /<Popup className="sismo-event-popup sismo-epicenter-popup"/);
  assert.match(epicenter, /markerRef\.current\.openPopup\(\)/);
});

test('animación ligera y tipografía compartida, con accesibilidad', () => {
  assert.match(styles, /@keyframes sismo-cluster-open/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /font-family:\s*inherit/);
  assert.match(cluster, /aria-label=\{`Detalle de/);
});

test('leyenda conserva las cuatro categorías IGP', () => {
  const legend = source.slice(source.indexOf('function MagnitudeLegend()'), source.indexOf('/** Nombre de capa activa'));
  assert.equal((legend.match(/label:/g) || []).length, 4);
  for (const key of ['low','medium','high','unknown']) assert.match(legend, new RegExp('MAGNITUDE_COLORS\\.' + key));
});
