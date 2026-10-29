/** Revisión 09: criterios de accesibilidad, claridad y procedencia de gráficos IGP. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
const page = readFileSync(resolve(root, 'apps/web/src/modules/modelos-ml/Page.tsx'), 'utf8');
const types = readFileSync(resolve(root, 'apps/web/src/types/ml.ts'), 'utf8');

test('las dos tablas comparten columnas y disponen del ancho necesario para Ver gráfico', () => {
  assert.equal((page.match(/<ComparisonColumns\/><ComparisonHeader\/>/g) || []).length, 2);
  assert.equal((page.match(/min-w-\[1320px\] table-fixed/g) || []).length, 2);
  assert.match(page, /<col className="w-\[10%\]"\/>\s*\n\s*<\/colgroup>/);
  assert.match(page, /<th className="px-4 py-3 text-left">Detalle<\/th>/);
  assert.match(page, /<th className="px-4 py-3 text-left">Métrica adicional<\/th>/);
  assert.equal((page.match(/whitespace-nowrap rounded-lg border border-border-ui bg-panel px-2 py-1.5/g) || []).length, 2);
});

test('nombres naturales en Experimentos, Comparación y Estimaciones sin alterar los IDs técnicos', () => {
  for (const name of ['Regresión lineal simple', 'Regresión lineal múltiple', 'KNN de profundidad', 'Bosque aleatorio (Random Forest)']) {
    assert.ok(page.includes(name));
  }
  assert.match(page, /algorithmName\(row\.algorithm\)/);
  assert.match(page, /algorithmName\(model\.algorithm\)/);
  assert.match(page, /algorithmName\(item\.algorithm\)/);
  assert.match(page, /algorithmName\(estimateDetail\.algorithm\)/);
  assert.match(page, /item\.algorithm, item\.target_name/); // CSV conserva trazabilidad técnica
});

test('2025 abre su propio gráfico con métricas reales y matrices sin reconstruir curvas ficticias', () => {
  assert.match(page, /const \[graphPeriod, setGraphPeriod\] = useState<2024 \| 2025>\(2024\)/);
  assert.match(page, /selectGraph\(model\.id, 2024\)/);
  assert.match(page, /selectGraph\(model\.id, 2025\)/);
  assert.match(page, /graphDetailRef\.current\?\.scrollIntoView/);
  assert.match(page, /finalReport && finalReport\.batch_id === finalBatchId/);
  assert.match(page, /finalModel\?\.metrics\[key\]/);
  assert.match(page, /graphPeriod === 2025 && currentModel\.task_type === 'regression'/);
  assert.match(page, /<BarChart data=\{finalRegressionBars\}/);
  assert.match(page, /<ClassificationEvidence metrics=\{chartMetrics\} period=\{graphPeriod\}\/>/);
  assert.match(page, /No se almacenaron pares por evento/);
  assert.match(types, /metrics: Experiment\['metrics'\]/);
  assert.doesNotMatch(page, /Solo resumen final/);
});

test('tooltip del gráfico usa colores semánticos correctos para tema oscuro', () => {
  assert.match(page, /function ComparisonTooltip/);
  assert.match(page, /border-border-ui bg-panel p-3 text-xs text-main shadow-xl/);
  assert.match(page, /Fecha y hora: \$\{date\(value\)\}/);
  assert.equal((page.match(/<Tooltip content=\{<ComparisonTooltip\/>\}\/>/g) || []).length, 2);
  assert.doesNotMatch(page, /<Tooltip labelFormatter=/);
});

test('CSV distingue 2024 por sismo de 2025 solo métricas agregadas', () => {
  assert.match(page, /function exportFinalMetricsCsv/);
  assert.match(page, /evaluacion-final-igp-2025-metricas\.csv/);
  assert.match(page, /graphPeriod === 2025 && finalReport && finalModel && finalBaseline/);
  assert.match(page, /exportFinalMetricsCsv\(finalModel, finalBaseline, finalReport\.batch_id\)/);
  assert.match(page, /graphPeriod === 2024 && currentModel && predictionRows\.length > 0/);
  assert.match(page, /exportPredictionCsv\(predictionRows, currentModel\.id\)/);
});

test('las predicciones por sismo y la trazabilidad siguen siendo exclusivas de 2024', () => {
  assert.match(page, /graphPeriod === 2024 && predictionRows\.length > 0/);
  assert.match(page, /graphPeriod === 2024 && currentModel\.task_type === 'regression'/);
  assert.match(page, /Trazabilidad por sismo · Validación 2024/);
  assert.match(page, /getValidationPredictions\(modelId, controller\.signal\)/);
});
