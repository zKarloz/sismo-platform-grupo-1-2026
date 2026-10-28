/** Pruebas de regresión Fase B: historial real, permisos y magnitud. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const source = rel => readFileSync(path.join(root, rel), 'utf8');
const page = source('apps/web/src/modules/alertas/Page.tsx');
const api = source('apps/web/src/services/alerts.ts');
const builder = source('apps/web/src/modules/alertas/RuleBuilder.tsx');
const backend = source('services/api/app/routes/alerts.py');

test('API: historial paginado SQL, estado y canal con rol y origen IGP obligatorios', () => {
  assert.match(backend, /@router\.get\('\/alert-deliveries'\)/);
  assert.match(backend, /require_roles\('administrador', 'operador_alertas', 'auditor'\)/);
  assert.match(backend, /sources\.c\.name == IGP_SOURCE/);
  assert.match(backend, /\.offset\(\(page - 1\) \* page_size\)\.limit\(page_size\)/);
  assert.match(backend, /deliveries\.c\.status == status/);
  assert.match(backend, /deliveries\.c\.channel == channel/);
});

test('API: nunca publica email completo ni errores SMTP crudos', () => {
  assert.match(backend, /_delivery_destination\(/);
  assert.match(backend, /item\.pop\('destination_ref'\)/);
  assert.match(backend, /SAFE_DELIVERY_ERRORS/);
  assert.match(backend, /ERROR_NO_CLASIFICADO/);
});

test('Frontend: obtiene entregas reales y las pagina con TablePagination 5-10-20', () => {
  assert.match(api, /export const getAlertDeliveries/);
  assert.match(api, /\/api\/v1\/alert-deliveries\?page=/);
  assert.match(page, /getAlertDeliveries\(deliveryPage, deliveryPageSize, deliveryStatus, deliveryChannel, abort\.signal\)/);
  assert.match(page, /\[deliveryPageSize, setDeliveryPageSize\] = useState<TablePageSize>\(5\)/);
  assert.match(page, /page=\{deliveryPage\} pages=\{deliveryPages\}/);
  assert.match(page, /Filtrar entregas por estado/);
  assert.match(page, /Filtrar entregas por canal/);
});

test('Frontend: protege la pestaña según rol y distingue SMTP de recepción', () => {
  assert.match(page, /canViewDeliveries = isAdmin \|\| profile\?\.role === 'operador_alertas' \|\| profile\?\.role === 'auditor'/);
  assert.match(page, /'entregas' \|\| !canViewDeliveries/);
  assert.match(page, /no confirma recepción ni lectura/);
  assert.doesNotMatch(page, /Historial de entregas en preparación/);
  assert.match(page, /<GmailTestForm recipient=/);
});

test('Crear regla: elimina tarjeta duplicada y muestra Valor exacto M ≥ al costado', () => {
  assert.match(builder, /Valor exacto M ≥/);
  assert.match(builder, /type="range" min="0" max="10" step="0\.1"/);
  assert.match(builder, /aria-label="Valor exacto de magnitud mínima"/);
  assert.doesNotMatch(builder, /<span className="rounded-md border border-border-ui bg-panel-alt px-2\.5 py-1 text-sm font-semibold tabular-nums text-main">M ≥/);
});
