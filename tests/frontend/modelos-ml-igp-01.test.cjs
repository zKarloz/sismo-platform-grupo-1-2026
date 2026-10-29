/** Pruebas estáticas: evitar errores de integración del patch sin browser/servidor. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const ui = read('apps/web/src/modules/modelos-ml/Page.tsx');
const api = read('services/api/app/routes/ml.py');
const lab = read('services/api/app/ml/igp_experiments.py');

test('IGP se filtra en FastAPI, no solo en frontend', () => {
  assert.match(api, /datasets\.c\.query_spec\['source'\]\.as_string\(\) == SOURCE/);
  assert.match(api, /dataset_kind/);
  assert.doesNotMatch(api, /post\(['"]\/experiments/);
});
test('cuatro objetivos, cuatro baselines y periodo 2025 reservado', () => {
  for (const objective of ['magnitude_observed', 'depth_observed', 'depth_class_observed', 'magnitude_range_observed'])
    assert.ok(lab.includes(objective));
  assert.match(lab, /DummyClassifier/);
  assert.match(lab, /DummyRegressor/);
  assert.match(lab, /test_2025_reserved/);
  assert.match(lab, /StandardScaler/);
  assert.match(lab, /class_weight='balanced'/);
});
test('tres pestañas y acciones a la derecha, un gráfico visible por vez', () => {
  assert.match(ui, /Experimentos/);
  assert.match(ui, /Comparación/);
  assert.match(ui, /Estimaciones/);
  assert.match(ui, /Filtros/);
  assert.match(ui, /Actualizar/);
  assert.match(ui, /CSV/);
  assert.match(ui, /<Modal/);
  assert.match(ui, /<TablePagination/);
  assert.match(ui, /currentModel\.task_type === 'regression'/);
  assert.match(ui, /confusion_matrix/);
});
test('pantalla no publica pronósticos oficiales ni datos simulados', () => {
  assert.match(ui, /no predicciones sísmicas/i);
  assert.match(ui, /sin revisión registrada/i);
  assert.match(ui, /no están aprobados ni se envían al Centro de alertas/i);
  assert.match(ui, /escasez de sismos profundos/);
});
