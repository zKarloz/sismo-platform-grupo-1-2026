/** Regresión de navegación y acciones: pruebas estáticas para ejecutar sin navegador. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const get = name => readFileSync(path.join(root, name), 'utf8');
const page = get('apps/web/src/modules/alertas/Page.tsx');
const personal = get('apps/web/src/modules/mis-notificaciones/Page.tsx');
const rule = get('apps/web/src/modules/alertas/RuleBuilder.tsx');
const smtp = get('apps/web/src/modules/alertas/SmtpSettingsPanel.tsx');

test('Ambos módulos usan las pestañas subrayadas de Fuentes de datos', () => {
  for (const code of [page, personal]) {
    assert.match(code, /flex flex-wrap gap-1 border-b border-border-ui/);
    assert.match(code, /border-b-2 border-accent text-main/);
    assert.doesNotMatch(code, /rounded-lg border px-4 py-2 text-sm font-medium transition-colors/);
  }
});
test('Acciones de Reglas usan el Modal común en lugar de tarjetas expandibles', () => {
  assert.match(page, /import Modal from '\.\.\/\.\.\/components\/ui\/Modal'/);
  assert.match(page, /onClick=\{\(\) => setRuleModal\(true\)\}/);
  assert.match(page, /setSimulationModal\(true\)/);
  assert.match(page, /title="Crear regla de alerta"/);
  assert.match(page, /title="Probar regla sin generar alertas"/);
  assert.match(page, /<RuleBuilder onCreated=\{refresh\}\/>/);
  assert.match(page, /simulateAlertRule\(simulationRule, simulationEvent\)/);
  assert.doesNotMatch(rule, /const \[opened, setOpened\]/);
  assert.match(rule, /<form onSubmit/);
  assert.match(rule, /createAlertRule\(payload\)/);
});
test('Gmail: acción superior abre modal y el password vive solo en formulario efímero', () => {
  assert.match(page, /Probar mi Gmail desde la web \(opcional\)/);
  assert.match(page, /setGmailModal\(true\)/);
  assert.match(page, /<GmailTestForm recipient=/);
  assert.match(smtp, /export function GmailTestForm/);
  assert.match(smtp, /const \[password,setPassword\] = useState\(''\)/);
  assert.match(smtp, /finally \{setBusy\(false\);setPassword\(''\);\}/);
  assert.match(smtp, /sendGmailTechnicalTest\(gmail\.trim\(\),password\)/);
  assert.doesNotMatch(smtp, /showForm/);
});
test('Permisos de los 3 formularios permanecen diferenciados', () => {
  assert.match(page, /isAdmin && <Modal open=\{ruleModal\}/);
  assert.match(page, /open=\{simulationModal && canSimulate\}/);
  assert.match(page, /isAdmin && <Modal open=\{gmailModal\}/);
  assert.match(page, /role="tabpanel"/);
});
