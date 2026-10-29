/** Contratos UI de revisión humana: rol explícito y acción real conectada a FastAPI. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = p => fs.readFileSync(`${process.cwd()}/${p}`, 'utf8');

test('se consultan decisiones reales y se diferencia pendiente de aprobado/rechazado', () => {
  const page = read('apps/web/src/modules/calidad-datos/Page.tsx');
  const route = read('services/api/app/routes/quality.py');
  assert.match(page, /review_decision === 'approved'/);
  assert.match(page, /review_decision === 'rejected'/);
  assert.match(route, /dataset_reviews\.c\.decision\.label\("review_decision"\)/);
  assert.match(route, /outerjoin\(dataset_reviews/);
});

test('sólo administrador o analista ven acción y el servidor exige JWT/RBAC', () => {
  const page = read('apps/web/src/modules/calidad-datos/Page.tsx');
  const route = read('services/api/app/routes/quality.py');
  assert.match(page, /profile\?\.role === 'administrador' \|\| profile\?\.role === 'analista'/);
  assert.match(page, /canReview && !selected\.review_decision/);
  assert.match(route, /Depends\(require_roles\("administrador", "analista"\)\)/);
});

test('confirma decisión con una nota y no inventa usuario autenticado', () => {
  const page = read('apps/web/src/modules/calidad-datos/Page.tsx');
  const service = read('apps/web/src/services/quality.ts');
  assert.match(page, /reviewNote\.trim\(\)/);
  assert.match(page, /submitReview/);
  assert.match(service, /apiAuthed<DatasetReviewResponse>/);
  assert.match(service, /method: 'POST'/);
});

test('revisión es inmutable y no toca los snapshots o métricas', () => {
  const sql = read('database/migrations/011_CALIDAD_DATASETS_IGP_03_REVISION.sql');
  const route = read('services/api/app/routes/quality.py');
  assert.match(sql, /dataset_reviews_immutable/);
  assert.match(route, /content_sha256\(rows\) == ds\["content_sha256"\]/);
  assert.match(route, /audit_logs\.insert\(\)/);
  assert.doesNotMatch(sql, /DELETE FROM public\.datasets/i);
});
