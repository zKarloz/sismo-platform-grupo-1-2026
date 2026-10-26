/** Revisiones del selector de mapa base (contratos estáticos; validar Leaflet visualmente). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../../apps/web/src/modules/mapa-sismico/Page.tsx');
const src = fs.readFileSync(file, 'utf8');

test('mantiene OpenStreetMap y fondo vacío aunque no haya clave', () => {
  assert.match(src, /<LayersControl.BaseLayer checked name="OpenStreetMap">/);
  assert.match(src, /<LayersControl.BaseLayer name="Sin mapa base">/);
});

test('usa estilos raster documentados para claro, oscuro y satélite', () => {
  assert.match(src, /mapTilerRaster\('dataviz-light', 'png'\)/);
  assert.match(src, /mapTilerRaster\('dataviz-dark', 'png'\)/);
  assert.match(src, /mapTilerRaster\('satellite-v4', 'jpg'\)/);
  assert.match(src, /maps\/\$\{style\}\/256\/\{z\}\/\{x\}\/\{y\}/);
});

test('no consulta nuevas capas sin una clave de proveedor', () => {
  assert.match(src, /import\.meta\.env\.VITE_MAPTILER_KEY/);
  assert.equal((src.match(/\{MAPTILER_KEY && <LayersControl.BaseLayer/g) || []).length, 3);
});

test('mantiene fuente IGP y evita reconstruir el mapa al elegir fondo', () => {
  assert.match(src, /<ClusteredMarkers features=\{features\}/);
  assert.match(src, /<ActiveLayerTracker onChange=\{setLayerName\}/);
  assert.doesNotMatch(src, /<MapContainer[^>]*key=\{layerName\}/);
});

test('atribuye MapTiler y OpenStreetMap y muestra el logo en capa activa', () => {
  assert.match(src, /www\.maptiler\.com\/copyright/);
  assert.match(src, /www\.openstreetmap\.org\/copyright/);
  assert.match(src, /layerName\.endsWith\('\(MapTiler\)'\)/);
  assert.match(src, /api\.maptiler\.com\/resources\/logo\.svg/);
});
