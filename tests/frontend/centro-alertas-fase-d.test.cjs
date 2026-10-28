/* Revisión estructural de Fase D; no sustituye un build completo de Vite. */
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const page = fs.readFileSync(path.join(root, 'apps/web/src/modules/alertas/Page.tsx'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/igp-sync.yml'), 'utf8');
const service = fs.readFileSync(path.join(root, 'services/api/app/alerts/service.py'), 'utf8');

test('Entregas agrupa tabla y paginación en un solo panel', () => {
  const start = page.indexOf('Un solo contenedor visual para las filas y TablePagination');
  const footer = page.indexOf('<TablePagination page={deliveryPage}', start);
  assert.ok(start > 0 && footer > start);
  assert.match(page.slice(start, footer), /overflow-hidden rounded-xl border border-border-ui bg-panel/);
  assert.doesNotMatch(page.slice(start, footer), /hidden overflow-x-auto rounded-xl border/);
});

test('Workflow: prueba de correo requiere flag + evento manual + aceptación del input', () => {
  assert.match(workflow, /test_operational_email:\s*\n/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.test_operational_email == true && vars\.ENABLE_OPERATIONAL_EMAIL == 'true'/);
  assert.match(workflow, /OPERATIONAL_EMAIL_TEST_RECIPIENT: \$\{\{ secrets\.OPERATIONAL_EMAIL_TEST_RECIPIENT \}\}/);
  assert.match(workflow, /OPERATIONAL_EMAIL_TEST_MODE: 'true'/);
});

test('Workflow: el despacho interno continúa y ya no se programan correos personales', () => {
  assert.match(workflow, /python -m app\.commands\.alerts dispatch\n/);
  assert.doesNotMatch(workflow, /python -m app\.commands\.personal_notifications (evaluate|dispatch)/);
});

test('Backend: límite de una entrega en prueba y destino protegido en reserva CAS', () => {
  assert.match(service, /\.limit\(1 if test_mode else batch_limit\)/);
  assert.match(service, /claim_conditions\.append\(destination_guard\)/);
  assert.match(service, /Falta destinatario válido para prueba operativa/);
});
