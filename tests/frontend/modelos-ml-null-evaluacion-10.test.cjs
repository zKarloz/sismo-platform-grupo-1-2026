/** Revisión 10: evita TS18047 en el acceso a las métricas finales de 2025. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const page = readFileSync(resolve(__dirname, '../../apps/web/src/modules/modelos-ml/Page.tsx'), 'utf8');

test('valida finalReport antes de consultar modelos finales y baseline', () => {
  assert.match(page, /const finalModel = finalReport && finalReport\.batch_id === finalBatchId\s*\? finalReport\.models\.find/);
  assert.match(page, /const finalBaseline = finalReport && finalReport\.batch_id === finalBatchId\s*\? finalReport\.models\.find/);
  assert.doesNotMatch(page, /finalReport\?\.batch_id === finalBatchId\s*\? finalReport\.models/);
});

test('mantiene separación de gráficos de validación 2024 y prueba final 2025', () => {
  assert.match(page, /const chartMetrics = graphPeriod === 2025 \? finalModel\?\.metrics : currentModel\?\.metrics/);
  assert.match(page, /const chartBaselineMetrics = graphPeriod === 2025 \? finalBaseline\?\.metrics : baseline\?\.metrics/);
  assert.match(page, /No se almacenaron pares por evento/);
});
