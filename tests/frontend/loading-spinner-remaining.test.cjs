// Contrato estático: todas las pantallas con estados de carga usan el spinner compartido.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.resolve(root, p), 'utf8');

const pages = [
  'dashboard/DashboardPage.tsx',
  'eventos/Page.tsx', 'eventos/IGPLivePanel.tsx',
  'historico-igp/Page.tsx', 'analisis/Page.tsx',
  'calidad-datos/Page.tsx', 'modelos-ml/Page.tsx',
  'mis-notificaciones/Page.tsx', 'alertas/Page.tsx',
  'alertas/RuleBuilder.tsx', 'alertas/SmtpSettingsPanel.tsx',
  'fuentes-datos/Page.tsx', 'usuarios-roles/Page.tsx',
  'usuarios-roles/UserModal.tsx', 'login/LoginPage.tsx',
  'login/SetPasswordPage.tsx',
];
for (const page of pages) {
  test(`${page} reutiliza LoadingSpinner`, () => {
    const source = read(`apps/web/src/modules/${page}`);
    assert.match(source, /import LoadingSpinner from '\.\.\/\.\.\/components\/ui\/LoadingSpinner'/);
    assert.match(source, /<LoadingSpinner /);
  });
}
test('la consulta histórica no muestra carga sin filtros aplicados', () => {
  const page = read('apps/web/src/modules/historico-igp/Page.tsx');
  assert.match(page, /if \(!applied\) \{setPending\(false\); return;\}/);
  assert.match(page, /\{pending \? <LoadingSpinner/);
});
test('el spinner respeta movimiento reducido y accesibilidad', () => {
  const spinner = read('apps/web/src/components/ui/LoadingSpinner.tsx');
  assert.match(spinner, /motion-reduce:animate-none/);
  assert.match(spinner, /role="status"/);
  assert.match(spinner, /LoaderCircle/);
});
