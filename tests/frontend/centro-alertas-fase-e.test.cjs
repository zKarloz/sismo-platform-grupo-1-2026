/** Fase E: validación estructural del corte del flujo personal y la navegación. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const yaml = read('.github/workflows/igp-sync.yml');
const router = read('apps/web/src/app/router.tsx');
const page = read('apps/web/src/modules/alertas/Page.tsx');
const service = read('services/api/app/alerts/service.py');
const api = read('services/api/app/routes/alerts.py');

test('el cron elimina ambos trabajos personales y conserva ingesta y avisos internos', () => {
  assert.doesNotMatch(yaml, /python -m app\.commands\.personal_notifications/);
  assert.match(yaml, /python -m app\.commands\.sync_igp/);
  assert.match(yaml, /python -m app\.commands\.alerts evaluate/);
  assert.match(yaml, /python -m app\.commands\.alerts dispatch\n/);
});

test('el correo operativo programado exige cron y bandera, y la prueba sigue siendo manual', () => {
  assert.match(yaml, /github\.event_name == 'schedule' && vars\.ENABLE_OPERATIONAL_EMAIL == 'true' && vars\.ENABLE_PERSONAL_EMAIL == 'false'/);
  assert.match(yaml, /github\.event_name == 'workflow_dispatch' && inputs\.test_operational_email == true && vars\.ENABLE_OPERATIONAL_EMAIL == 'true'/);
  assert.match(yaml, /OPERATIONAL_EMAIL_MAX_AGE_HOURS:/);
  assert.match(yaml, /OPERATIONAL_EMAIL_BATCH_LIMIT:/);
  assert.match(yaml, /OPERATIONAL_EMAIL_TEST_MODE: 'false'/);
  assert.match(yaml, /OPERATIONAL_EMAIL_TEST_MODE: 'true'/);
});

test('la ruta antigua no es pública y las tres rutas del centro se conservan', () => {
  assert.doesNotMatch(router, /import MisNotificacionesPage|path: 'mis-notificaciones'/);
  for (const route of ['alertas', 'alertas/reglas', 'alertas/entregas']) {
    assert.match(router, new RegExp(`path: '${route}'`));
  }
});

test('el backend bloquea correos viejos antes del claim y expone código seguro', () => {
  assert.match(service, /_operational_email_max_age/);
  assert.match(service, /_recent_email_event\(now, email_age\)/);
  assert.match(service, /_expire_old_email_deliveries\(engine, now, email_age, destination_guard\)/);
  assert.match(service, /OPERATIONAL_EMAIL_BATCH_LIMIT/);
  assert.match(api, /EVENT_TOO_OLD/);
  assert.match(page, /Caducada/);
  assert.match(page, /Correo no enviado: el sismo superó/);
});
