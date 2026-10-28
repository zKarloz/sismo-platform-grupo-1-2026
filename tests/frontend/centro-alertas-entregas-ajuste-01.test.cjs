/** Regresión visual estructural: detalle a ancho completo, flecha y caducidad. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const page = fs.readFileSync(path.join(root, 'apps/web/src/modules/alertas/Page.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'services/api/app/routes/alerts.py'), 'utf8');

test('las entregas expanden una fila de ancho completo, no la celda Detalle', () => {
  assert.match(page, /<Fragment key=\{item\.id\}>/);
  assert.match(page, /<td colSpan=\{7\} id=\{`entrega-escritorio-\$\{item\.id\}`\}/);
  assert.doesNotMatch(page, /<td className="px-4 py-3"><details/);
});

test('la flecha de ambas vistas gira e informa accesiblemente su estado', () => {
  assert.match(page, /import \{[^\n]+ChevronDown/);
  assert.equal((page.match(/aria-expanded=\{expandedDeliveryId === item\.id\}/g) || []).length, 2);
  assert.equal((page.match(/expandedDeliveryId === item\.id \? 'rotate-180' : ''/g) || []).length, 2);
});

test('los detalles se organizan horizontalmente; solo la observación tiene fondo amarillo', () => {
  assert.match(page, /grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3/);
  assert.match(page, /bg-panel-alt\/40/);
  assert.match(page, /rounded-lg border border-yellow-300 bg-yellow-100\/80 p-3/);
  assert.match(page, /dark:border-amber-700 dark:bg-amber-950\/65/);
  assert.match(page, /<strong>Observación:<\/strong>/);
  assert.match(page, /<DeliveryExpandedDetails item=\{item\}\/>/);
});

test('el selector distingue Caducada de Cancelada y la API filtra ambos estados', () => {
  assert.match(page, /<option value="expired">Caducada<\/option>/);
  assert.match(page, /<option value="cancelled">Cancelada<\/option>/);
  assert.match(page, /isExpiredDelivery\(item\) \? 'Caducada'/);
  assert.match(api, /status == 'expired'/);
  assert.match(api, /status == 'cancelled'/);
});

test('el cambio de filtro o página cierra detalles y conserva la paginación compartida', () => {
  assert.match(page, /onPageChange=\{next => \{setDeliveryPage\(next\);setExpandedDeliveryId\(null\);\}\}/);
  assert.match(page, /<TablePagination page=\{deliveryPage\}/);
  assert.match(page, /overflow-hidden rounded-xl border border-border-ui bg-panel/);
});
