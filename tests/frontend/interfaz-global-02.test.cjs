/** Pruebas estáticas de regresión del parche de interfaz global 02. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const css = () => read('apps/web/src/index.css');
const layout = () => read('apps/web/src/app/AppLayout.tsx');
const guard = () => read('apps/web/src/auth/ProtectedRoute.tsx');
const map = () => read('apps/web/src/modules/mapa-sismico/Page.tsx');

test('tema claro: sidebar y topbar comparten un color gris editable', () => {
  assert.match(css(), /--ui-shell:\s*#e9edf2;/);
  assert.match(css(), /--color-shell:\s*var\(--ui-shell\);/);
  assert.match(layout(), /<aside[^\n]+bg-shell text-main/);
  assert.match(layout(), /<header[^\n]+bg-shell/);
  assert.match(css(), /--ui-sidebar-muted:\s*#475569;/);
});

test('tema oscuro define superficie compartida sin colorear el contenido', () => {
  assert.match(css(), /:root\.dark\s*\{[\s\S]*--ui-shell:\s*#171717;/);
  assert.match(css(), /--ui-page:\s*#f8fafc;/);
  assert.match(css(), /--ui-panel:\s*#ffffff;/);
});

test('validando sesión reutiliza LoadingSpinner y mantiene barrera de autenticación', () => {
  assert.match(guard(), /if \(loading\) return \(/);
  assert.match(guard(), /<LoadingSpinner size="lg" label="Verificando credenciales…"/);
  assert.match(guard(), /from '\.\.\/components\/ui\/LoadingSpinner'/);
  assert.match(guard(), /if \(!profile\) return <Navigate/);
});

test('cada epicentro utiliza reporte individual verificado y no el portal general', () => {
  const helper = read('apps/web/src/lib/igpReportUrl.ts');
  assert.match(helper, /https:\/\/ultimosismo\.igp\.gob\.pe\/evento\/\$\{match\[1\]\}/);
  assert.match(helper, /url\.hostname === 'ultimosismo\.igp\.gob\.pe'/);
  assert.match(map(), /const reportUrl = individualIGPReport\(event\.external_id, event\.source_url\)/);
  assert.match(map(), /href=\{reportUrl\}/);
  assert.doesNotMatch(map(), /href=\{event\.source_url\}/);
});

test('corrección de juntas raster localizada y sin ocultar polígonos de filtros', () => {
  assert.match(map(), /<TileLayer className="sismo-base-tiles" url="https:\/\/tile\.openstreetmap\.org/);
  const styles = read('apps/web/src/modules/mapa-sismico/mapStyles.css');
  assert.match(styles, /\.sismo-leaflet-map \.sismo-base-tiles img\.leaflet-tile/);
  assert.match(styles, /scale:\s*1\.005;/);
  assert.match(map(), /<Polygon/);
  assert.match(map(), /<Circle center=/);
});
