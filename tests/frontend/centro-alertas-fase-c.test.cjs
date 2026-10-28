/** Regresión Fase C sin acceso a SMTP ni a servicios externos. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const load = rel => readFileSync(path.join(root, rel), 'utf8');
const builder = load('apps/web/src/modules/alertas/RuleBuilder.tsx');
const page = load('apps/web/src/modules/alertas/Page.tsx');
const service = load('services/api/app/alerts/service.py');
const routes = load('services/api/app/routes/alerts.py');

test('Modal: nombre y valor exacto son columnas hermanas en escritorio', () => {
  const nameIndex = builder.indexOf('Nombre de la regla');
  const exactIndex = builder.indexOf('Valor exacto M ≥');
  const sliderIndex = builder.indexOf('id="regla-magnitud"');
  assert.ok(nameIndex !== -1 && nameIndex < exactIndex && exactIndex < sliderIndex);
  assert.match(builder.slice(nameIndex,exactIndex), /<\/label>\s*\{\/\*/);
  assert.match(builder.slice(exactIndex,sliderIndex), /sm:col-span-2/);
  assert.match(builder, /sm:grid-cols-2/);
});

test('Modal: el slider comparte estado con el valor exacto', () => {
  assert.match(builder, /value=\{magnitude\} onChange=\{e=>setMagnitude\(e\.target\.value\)\}/);
  assert.match(builder, /setMagnitude\(Number\(e\.target\.value\)\.toFixed\(1\)\)/);
  assert.match(builder, /aria-label="Valor exacto de magnitud mínima"/);
});

test('Modal: el botón Crear regla desactivada contrasta en ambos temas', () => {
  assert.match(builder, /dark:bg-zinc-100 dark:text-zinc-950/);
  assert.match(builder, /bg-zinc-900/);
  assert.match(builder, /Crear regla desactivada/);
  assert.doesNotMatch(builder, /bg-accent px-4 py-2 text-sm font-semibold text-white/);
});

test('API: código de resultado SMTP incierto se limita a lista segura', () => {
  assert.match(routes, /SAFE_DELIVERY_ERRORS.*SMTP_OUTCOME_UNKNOWN/);
  assert.match(routes, /item\.pop\('destination_ref'\)/);
  assert.doesNotMatch(service, /raise RuntimeError\(str\(exc\)\)/);
});

test('UI: un fallo ambiguo muestra revisión y nunca se presenta como fallido confirmado', () => {
  assert.match(page, /isUncertainDelivery/);
  assert.match(page, /Revisión requerida/);
  assert.match(page, /Se suspendieron los reintentos automáticos/);
  assert.match(page, /dark:bg-amber-950/);
});

test('Despachador: reserva antes de SMTP y no devuelve errores privados', () => {
  assert.match(service, /def _eligible_delivery\(/);
  assert.match(service, /_eligible_delivery\(now\)/);
  assert.match(service, /SMTP_OUTCOME_UNKNOWN/);
  assert.match(service, /alert\.delivery\.claimed/);
  assert.match(service, /def review\(/);
  assert.match(service, /alerts\.c\.status == 'pending'/);
});
