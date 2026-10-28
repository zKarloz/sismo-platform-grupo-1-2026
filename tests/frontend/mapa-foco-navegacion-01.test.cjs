/** Pruebas de regresión del foco temporal al navegar desde Eventos sísmicos.
 * Verifican que los caminos de interacción limpien el parámetro de URL,
 * sin depender del servicio IGP ni de un mapa en red.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const map = fs.readFileSync('apps/web/src/modules/mapa-sismico/Page.tsx', 'utf8');

const section = (from, to) => map.split(from)[1]?.split(to)[0] ?? '';

test('El enlace IGP sigue enfocando el reporte inicial con datos reales', () => {
  assert.match(map, /params\.get\('igp_event'\)/);
  assert.match(map, /candidate\.external_id === targetId/);
  assert.match(map, /markerRef\.current\.openPopup\(\)/);
});

test('Cerrar el popup con X elimina el foco incluso si llegó de Eventos sísmicos', () => {
  const markers = section('function ClusteredMarkers(', 'function MagnitudeLegend(');
  assert.match(markers, /onPopupClose\(cluster\.events\[0\]\.properties\.external_id\)/);
  assert.match(markers, /onPopupClose\(selectedFeature\.properties\.external_id\)/);
  assert.doesNotMatch(markers, /selectedId !== dashboardTargetId \?/);
});

test('La URL deja de mantener el foco después de cerrar o navegar', () => {
  const clear = section('function removeUrlTarget()', 'return <div');
  assert.match(clear, /next\.delete\('igp_event'\)/);
  assert.match(clear, /setParams\(next, \{ replace: true \}\)/);
  assert.match(clear, /function clearFocus\(\)/);
  assert.match(clear, /setManualFocusId\(null\)/);
});

test('Zoom, clic y desplazamiento del mapa liberan el foco sin interceptar el popup', () => {
  const bridge = section('function ReleaseFocusOnInteraction(', '/** Mosaicos raster');
  assert.match(bridge, /addEventListener\('wheel'/);
  assert.match(bridge, /addEventListener\('pointerdown'/);
  assert.match(bridge, /addEventListener\('keydown'/);
  assert.match(bridge, /closest\('\.leaflet-popup'\)/);
  assert.match(map, /<ReleaseFocusOnInteraction active=\{Boolean\(selectedId\)\} onRelease=\{clearFocus\}/);
});

test('Seleccionar un epicentro distinto reemplaza el anterior y limpia igp_event', () => {
  const select = section('function selectEpicenter(', 'return <div');
  assert.match(select, /selectedIdRef\.current = externalId/);
  assert.match(select, /setManualFocusId\(externalId\)/);
  assert.match(select, /removeUrlTarget\(\)/);
  assert.match(map, /onSelect=\{selectEpicenter\}/);
});

test('No borrar una selección nueva al cambiar el parámetro de URL', () => {
  assert.match(map, /if \(targetId && previousTargetRef\.current !== targetId\)/);
  assert.doesNotMatch(map, /useEffect\(\(\) => setManualFocusId\(null\), \[targetId\]\)/);
  assert.match(map, /if \(selectedIdRef\.current === externalId\) clearFocus\(\)/);
});

test('Se mantienen controles de filtro, capas y fuente de datos', () => {
  assert.match(map, /<FitMarkers features=\{catalogFeatures\}/);
  assert.match(map, /<LayersControl position="topright">/);
  assert.match(map, /<ClusteredMarkers features=\{features\}/);
});
