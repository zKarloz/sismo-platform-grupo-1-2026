/** Regresión estática del fix TS2322 y de las visualizaciones reales IGP. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const page = read('apps/web/src/modules/modelos-ml/Page.tsx');
const backend = read('services/api/app/routes/ml.py');
const replay = read('services/api/app/commands/backfill_igp_predictions.py');
const training = read('services/api/app/ml/igp_experiments.py');

test('corrige el TS2322: la bandera unknown no se renderiza', () => {
  assert.match(page, /row\.params\.baseline === true &&/);
  assert.doesNotMatch(page, /row\.params\.baseline &&/);
});
test('la tabla y CSV exponen pares reales de los registros de validación', () => {
  assert.match(page, /getValidationPredictions/);
  assert.match(page, /predictionRows\.slice/);
  assert.match(page, /exportPredictionCsv\(predictionRows/);
  assert.match(page, /source_row/);
  assert.match(page, /<TablePagination/);
});
test('API solo permite GET y filtra IGP/partición desde el servidor', () => {
  assert.match(backend, /@router\.get\('\/experiments\/\{experiment_id\}\/predictions'\)/);
  assert.match(backend, /datasets\.c\.query_spec\['source'\]\.as_string\(\) == SOURCE/);
  assert.match(backend, /ml_validation_predictions\.c\.split == 'validation'/);
});
test('la reconstrucción rechaza divergencias antes de guardar', () => {
  assert.match(replay, /persist=False/);
  assert.match(replay, /old\[key\] != candidate\[key\]/);
  assert.match(replay, /with engine\.begin\(\) as conn/);
  assert.match(training, /validation_predictions\('RandomForest-magnitude'/);
});
test('matriz, métricas por clase y comparación real-estimada sin prueba 2025', () => {
  assert.match(page, /confusion_matrix/);
  assert.match(page, /metrics\.per_class/);
  assert.match(page, /real_vs_estimated/);
  assert.match(page, /2025.*reservad/);
});
