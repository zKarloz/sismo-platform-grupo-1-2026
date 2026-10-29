/** Revisión 04: comparación fiel de modelos y CSV solo de predicciones reales. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const page = fs.readFileSync(path.resolve(__dirname, '../../apps/web/src/modules/modelos-ml/Page.tsx'), 'utf8');

test('resume todos los modelos en una misma evaluación y compara con su propio baseline', () => {
  assert.match(page, /Comparación de modelos · Validación IGP 2024/);
  assert.match(page, /models\.map\(model =>/);
  assert.match(page, /item\.target_name === model\.target_name && item\.params\.baseline === true/);
  assert.match(page, /comparisonScore\(model, reference\)/);
});

test('la comparación respeta dirección de MAE y F1 y muestra accuracy secundario', () => {
  assert.match(page, /regression \? expected - observed : observed - expected/);
  assert.match(page, /classification \? 'accuracy' : 'r2'/);
  assert.match(page, /<th className=\"px-4 py-3 text-right\">Mejora<\/th>/);
});

test('el usuario puede seleccionar el modelo de la tabla sin mezclar experimentos', () => {
  assert.match(page, /onClick=\{\(\) => selectGraph\(model\.id, 2024\)\}/);
  assert.match(page, /model\.id === currentModel\?\.id/);
  assert.match(page, /predictionResult && predictionResult\.experiment_id === modelId/);
});

test('el CSV de Comparación exige pares reales y no exporta la tabla de experimentos por error', () => {
  assert.match(page, /graphPeriod === 2025[\s\S]*?: !predictionLoading && predictionRows\.length > 0/);
  assert.match(page, /tab === 'comparacion' && graphPeriod === 2024 && currentModel && predictionRows\.length > 0/);
  assert.match(page, /else if \(tab === 'experimentos'\)/);
  assert.doesNotMatch(page, /: exportCsv\(current\?\.items/);
});
