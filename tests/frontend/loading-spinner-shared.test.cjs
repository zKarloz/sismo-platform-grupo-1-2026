// Pruebas estáticas del contrato del spinner y sus primeras integraciones.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('spinner compartido con roles accesibles, movimiento reducido y lucide-react', () => {
  const component = read('apps/web/src/components/ui/LoadingSpinner.tsx');
  assert.match(component, /LoaderCircle/);
  assert.match(component, /role="status"/);
  assert.match(component, /motion-reduce:animate-none/);
  assert.match(component, /'inline' \| 'centered' \| 'overlay'/);
});

test('auditoría usa el mismo componente en el historial y configuración', () => {
  const page = read('apps/web/src/modules/auditoria/Page.tsx');
  assert.match(page, /<LoadingSpinner label="Cargando registros/);
  assert.match(page, /<LoadingSpinner label="Consultando parámetros/);
});

test('reportes reutiliza spinner en el historial y al generar', () => {
  const page = read('apps/web/src/modules/reportes/Page.tsx');
  assert.match(page, /<LoadingSpinner label="Cargando reportes/);
  assert.match(page, /label="Generando…"/);
});

test('mapa muestra spinner de la consulta sobre el mapa sin alterar marcadores', () => {
  const page = read('apps/web/src/modules/mapa-sismico/Page.tsx');
  assert.match(page, /variant="overlay" label="Cargando epicentros/);
  assert.match(page, /clusterEpicenters/);
});
