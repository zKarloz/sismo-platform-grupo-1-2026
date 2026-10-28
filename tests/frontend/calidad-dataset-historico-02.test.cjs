/** Verificación contractual del soporte histórico y 2025 reservado. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = process.cwd();
const read = path => fs.readFileSync(`${root}/${path}`, 'utf8');

test('datasets muestra el origen histórico y la partición sin mezclar catálogo 2026', () => {
  const page = read('apps/web/src/modules/calidad-datos/Page.tsx');
  assert.match(page, /Histórico instrumental/);
  assert.match(page, /2025 permanece reservado/);
  assert.match(page, /quality_report\.by_split/);
  assert.match(page, /getDatasetPreview/);
});

test('API usa fila histórica para preview e integridad, preservando snapshots operativos', () => {
  const api = read('services/api/app/routes/quality.py');
  assert.match(api, /historical_snapshot_rows if historical else snapshot_rows/);
  assert.match(api, /split_valid/);
  assert.match(api, /IGP_DATASET/);
});

test('comando requiere --commit y reserva 2025 para test final', () => {
  const command = read('services/api/app/commands/create_historical_dataset.py');
  const prepare = read('services/api/app/quality/historical.py');
  assert.match(command, /--commit/);
  assert.match(prepare, /not 2019 <= year <= 2024/);
  assert.match(prepare, /holdout_test/);
  assert.match(prepare, /EXPECTED_XLSX_SHA256/);
});
