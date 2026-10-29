/** Revisión 05: contratos UI/API, sin supuestos de publicación ni probabilidad. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('apps/web/src/modules/modelos-ml/Page.tsx');
const api = read('services/api/app/routes/ml.py');
const service = read('apps/web/src/services/ml.ts');

test('estimaciones consultan FastAPI con filtros y paginación del servidor', () => {
  assert.match(service, /getRetrospectiveEstimates/);
  assert.match(service, /\/api\/v1\/ml\/estimates\?/);
  assert.match(page, /setEstimatePageSize/);
  assert.match(page, /TablePagination page=\{estimatePage\}/);
  assert.match(api, /@router\.get\('\/estimates'\)/);
});
test('endpoint comprueba fuente IGP, hash, año 2024 y deja fuera los baselines', () => {
  assert.match(api, /hist\.c\.record\['source_name'\]\.as_string\(\) == SOURCE/);
  assert.match(api, /ex\.c\.dataset_sha256 == datasets\.c\.content_sha256/);
  assert.match(api, /ex\.c\.params\['baseline'\]\.as_boolean\(\) == False/);
  assert.match(api, /datetime\(2025, 1, 1/);
});
test('la pantalla muestra observación, error retrospectivo y estado no revisado', () => {
  assert.match(page, /Estimaciones retrospectivas/);
  assert.match(page, /Error observado:/);
  assert.match(page, /Sin revisar/);
  assert.match(page, /No calibrado ni disponible/);
  assert.match(page, /fecha individual de cálculo/i);
  assert.match(page, /onClick=\{\(\) => setEstimateDetail\(item\)\}/);
});
test('CSV exporta solo estimaciones de la página actual, nunca datos de otro módulo', () => {
  assert.match(page, /exportEstimateCsv\(estimates\.items\)/);
  assert.match(page, /tab === 'estimaciones' && !estimateLoading && !estimateError/);
  assert.match(page, /estimaciones-retrospectivas-igp-2024-pagina.csv/);
  assert.doesNotMatch(service, /method:\s*['"]POST['"]/);
});
