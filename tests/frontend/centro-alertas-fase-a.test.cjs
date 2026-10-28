/** Fase A: regresión estática de navegación, formularios y transición segura. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const source = rel => readFileSync(path.join(root, rel), 'utf8');
const router = source('apps/web/src/app/router.tsx');
const navigation = source('apps/web/src/lib/navigation.ts');
const layout = source('apps/web/src/app/AppLayout.tsx');
const page = source('apps/web/src/modules/alertas/Page.tsx');
const builder = source('apps/web/src/modules/alertas/RuleBuilder.tsx');
const service = source('apps/web/src/services/alerts.ts');

test('un solo Centro de alertas en menú y perfil sin notificaciones personales', () => {
  assert.match(navigation, /label: 'Centro de alertas', path: '\/alertas'/);
  assert.doesNotMatch(navigation, /label: 'Alertas internas'|label: 'Mis notificaciones'/);
  assert.doesNotMatch(layout, /to="\/mis-notificaciones"/);
  assert.match(layout, /location\.pathname\.startsWith/);
});

test('tres rutas recargables con vínculo directo, una entrada en el sidebar', () => {
  for (const pathname of ['alertas', 'alertas/reglas', 'alertas/entregas']) {
    assert.ok(router.includes(`path: '${pathname}'`));
    assert.ok(page.includes(`path: '/${pathname}'`));
  }
  assert.match(page, /useLocation\(\)/);
  assert.match(page, /<NavLink/);
  assert.match(page, /border-b-2 border-accent text-main/);
});

test('tras el corte, la ruta personal deja de estar publicada', () => {
  assert.doesNotMatch(router, /path: 'mis-notificaciones'/);
  assert.doesNotMatch(navigation, /path: '\/mis-notificaciones'/);
  assert.doesNotMatch(layout, /Mis notificaciones/);
});

test('reglas conservan formularios en modales y ganan control deslizante', () => {
  assert.match(page, /<RuleBuilder onCreated={refresh}\/>/);
  assert.match(page, /title="Probar regla sin generar alertas"/);
  assert.match(builder, /type="range" min="0" max="10" step="0\.1"/);
  assert.match(builder, /Magnitud mínima/);
  assert.match(builder, /type="number" step="0\.1"/);
  assert.match(builder, /createAlertRule\(payload\)/);
  assert.match(builder, /channel === 'email' \|\| severity !== 'info'/);
});

test('entregas conserva acceso SMTP administrativo y muestra datos reales de Fase B', () => {
  assert.match(page, /Seguimiento de entregas/);
  assert.match(page, /getAlertDeliveries/);
  assert.match(page, /<SmtpSettingsPanel\/>/);
  assert.match(page, /Probar envío de correo/);
  assert.match(page, /isAdmin && <button/);
  assert.match(page, /<GmailTestForm recipient=/);
  assert.match(service, /api\/v1\/alert-deliveries/);
});
