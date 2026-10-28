/** Comprobación estática de integración en las páginas de alertas y notificaciones. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'../..');
const read = rel => readFileSync(path.join(root, rel),'utf8');
const operational = read('apps/web/src/modules/alertas/Page.tsx');
const personal = read('apps/web/src/modules/mis-notificaciones/Page.tsx');
const api = read('apps/web/src/services/alerts.ts');
const backend = read('services/api/app/routes/alerts.py');

test('bandeja, reglas y entregas son vistas con rutas propias', () => {
  for (const name of ['Bandeja', 'Reglas', 'Entregas']) assert.ok(operational.includes(name));
  assert.match(operational,/useLocation\(\)/);
  assert.match(operational,/tab === 'bandeja'/);
  assert.match(operational,/tab === 'reglas'/);
  assert.match(operational,/tab === 'entregas'/);
});
test('preferencias e historial usan paginación común', () => {
  assert.match(personal,/label:'Preferencias'/);
  assert.match(personal,/label:'Historial'/);
  assert.match(personal,/<TablePagination/);
  assert.match(personal,/useState<TablePageSize>\(5\)/);
  assert.match(operational,/<TablePagination/);
  assert.match(operational,/useState<TablePageSize>\(5\)/);
});
test('simulación no utiliza la operación de creación de alertas', () => {
  assert.match(api,/\/simulate\/\$\{encodeURIComponent\(eventId\)\}/);
  assert.match(operational,/simulateAlertRule\(/);
  assert.match(operational,/no envía correos, no crea avisos/);
});
test('lecturas requieren sesión y fuente IGP', () => {
  assert.match(backend,/Depends\(require_user\)/);
  assert.match(backend,/IGP_SOURCE = 'IGP\/CENSIS'/);
  // La Fase B lee el destino exclusivamente para devolver una representación anonimizada.
  assert.match(backend, /item\.pop\('destination_ref'\)/);
  assert.match(backend, /_delivery_destination/);
});
test('no hay textos de fase o versión en el módulo', () => {
  assert.doesNotMatch(operational,/Fase 7|V2/);
  assert.doesNotMatch(personal,/Fase 7|V2/);
});
