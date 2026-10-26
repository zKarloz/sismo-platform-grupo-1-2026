/** Regresiones de los popups del mapa y la política de autoencuadre.
 * Son pruebas estructurales: completar con pruebas visuales en Leaflet real.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'apps/web/src/modules/mapa-sismico/Page.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'apps/web/src/modules/mapa-sismico/mapStyles.css'), 'utf8');
const fit = source.slice(source.indexOf('function FitMarkers('), source.indexOf('/** Misma ficha'));
const mapPage = source.slice(source.indexOf('export default function Page()'));
const cluster = source.slice(source.indexOf('function ClusteredMarkers('), source.indexOf('/** Semáforo fijo'));
const epicenter = source.slice(source.indexOf('function Epicenter('), source.indexOf('function asLiveFeature('));

test('agrupamiento y epicentro usan una clase común de ancho', () => {
  assert.match(epicenter, /<Popup className="sismo-event-popup sismo-epicenter-popup"/);
  assert.match(cluster, /<Popup className="sismo-event-popup sismo-cluster-popup"/);
  assert.match(styles, /\.leaflet-popup\.sismo-event-popup \.leaflet-popup-content\s*\{/);
  assert.match(styles, /width:\s*min\(300px, calc\(100vw - 90px\)\)\s*!important/);
  assert.doesNotMatch(styles, /\.leaflet-popup\.sismo-cluster-popup \.leaflet-popup-content\s*\{\s*width:\s*auto/);
});

test('el popup mantiene ancho adaptable a pantallas pequeñas', () => {
  assert.match(styles, /max-width:\s*min\(300px, calc\(100vw - 90px\)\)\s*!important/);
  assert.match(styles, /box-sizing:\s*border-box/);
});

test('cerrar o seleccionar fichas no dispara autoencuadre', () => {
  assert.match(fit, /const focusedRef = useRef\(focused\)/);
  assert.match(fit, /if \(loading \|\| focusedRef\.current\) return/);
  const deps = fit.match(/\}, \[features, loading, map,[\s\S]*?\]\);/);
  assert.ok(deps, 'El fit debe depender del resultado de la consulta y la geometría');
  assert.doesNotMatch(deps[0], /\bfocused\b/);
  assert.doesNotMatch(fit, /\[features, focused, map/);
});

test('el autoencuadre usa solo catálogo estable, no selección IGP en vivo', () => {
  assert.match(mapPage, /const catalogFeatures = useMemo/);
  assert.match(mapPage, /\[catalogFeatures, targetId, selectedLive\]/);
  assert.match(mapPage, /<FitMarkers features=\{catalogFeatures\} focused=\{focused\} loading=\{loading\}/);
  assert.doesNotMatch(mapPage, /<FitMarkers features=\{features\}/);
});

test('zoom del agrupamiento ocurre solo al seleccionar un sismo, no al cerrar ficha', () => {
  assert.match(cluster, /function selectEventFromGroup\(feature: GeoFeature\)/);
  assert.match(cluster, /map\.flyTo\(target, focusZoom/);
  assert.match(cluster, /onClose=\{selectedId !== dashboardTargetId \? \(\) => onSelect\(null\)/);
  assert.doesNotMatch(fit, /map\.flyTo/);
  assert.match(epicenter, /if \(autoZoom\) map\.setView/);
});
