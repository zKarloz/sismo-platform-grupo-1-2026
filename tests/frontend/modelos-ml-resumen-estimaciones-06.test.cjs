/** Comprueba el resumen sin sustituir por datos de prueba los resultados reales. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const page = read('apps/web/src/modules/modelos-ml/Page.tsx');
const service = read('apps/web/src/services/ml.ts');
const api = read('services/api/app/routes/ml.py');

test('las cifras y los modelos se obtienen del resumen global de FastAPI', () => {
  assert.match(service, /getRetrospectiveEstimateSummary/);
  assert.match(service, /\/api\/v1\/ml\/estimates\/summary\?/);
  assert.match(page, /estimateSummary\.unique_events/);
  assert.match(page, /estimateSummary\.total_estimates/);
  assert.match(page, /estimateSummary\.models\.map/);
  assert.doesNotMatch(page, /556\s*\*\s*4/);
});
test('la tabla de 2.224 resultados se carga bajo demanda y filtrada por modelo', () => {
  assert.match(page, /useState\(false\)/);
  assert.match(page, /showEstimateRows/);
  assert.match(page, /Ver registros/);
  assert.match(page, /Explorar registros/);
  assert.match(page, /experimentId: estimateModelId/);
  assert.match(service, /params\.set\('experiment_id', filters\.experimentId\)/);
  assert.match(api, /ex\.c\.id == experiment_id/);
});
test('resumen y detalle comparten la política de IGP y validación 2024', () => {
  assert.match(api, /def _estimate_scope\(/);
  assert.match(api, /def estimate_summary\(/);
  assert.match(api, /def retrospective_estimates\(/);
  assert.match(api, /hist\.c\.record\['source_name'\]\.as_string\(\) == SOURCE/);
  assert.match(api, /ex\.c\.params\['baseline'\]\.as_boolean\(\) == False/);
  assert.match(api, /datetime\(2025, 1, 1/);
});
test('CSV del resumen y CSV del detalle son distintos y no generan registros', () => {
  assert.match(page, /exportEstimateSummaryCsv\(estimateSummary\)/);
  assert.match(page, /exportEstimateCsv\(estimates\.items\)/);
  assert.match(page, /estimaciones-igp-2024-resumen\.csv/);
  assert.match(page, /estimaciones-retrospectivas-igp-2024-pagina\.csv/);
  assert.doesNotMatch(service, /method:\s*['"]POST['"]/);
});
