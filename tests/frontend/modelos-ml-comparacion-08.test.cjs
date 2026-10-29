/** Revisión 08: claridad del período, métricas comparables y detalle bajo demanda. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../apps/web/src/modules/modelos-ml/Page.tsx'), 'utf8');

test('comparaciones claramente separadas para 2024 y 2025, con las mismas columnas', () => {
  assert.match(source, /Comparación de modelos · Validación IGP 2024/);
  assert.match(source, /Comparación de modelos · Prueba final independiente · IGP 2025/);
  assert.equal((source.match(/<ComparisonColumns\/><ComparisonHeader\/>/g) ?? []).length, 2);
  assert.match(source, /<th className="px-4 py-3 text-left">Algoritmo<\/th>/);
  assert.match(source, /<th className="px-4 py-3 text-right">Resultado del modelo<\/th>/);
  assert.doesNotMatch(source.slice(source.indexOf('function ComparisonHeader()'), source.indexOf('/** Compara un modelo')), /<th className="p-3">Modelo<\/th>/);
});

test('las métricas de clasificación se convierten a porcentajes y mejoras en pp', () => {
  assert.match(source, /const percent = .*?value == null/);
  assert.match(source, /\(value \* 100\)\.toLocaleString\('es-PE'/);
  assert.match(source, /minimumFractionDigits: 2, maximumFractionDigits: 2/);
  assert.match(source, /\} pp`/);
  assert.match(source, /regression \? `\$\{number\(value\)\}/);
  assert.match(source, /classification \? percent\(metric\(reference, 'accuracy'\)\)/);
  assert.match(source, /number\(metric\(reference, 'r2'\)\)/);
  assert.match(source, /percent\(values\.precision\)/);
  assert.match(source, /percent\(values\.recall\)/);
  assert.match(source, /percent\(values\['f1-score'\]\)/);
});

test('cada métrica explica cómo interpretarla en una tarjeta por clic', () => {
  assert.match(source, /function MetricInfo/);
  assert.match(source, /createPortal\(<div/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /role="tooltip"/);
  assert.match(source, /metricKey=\{regression \? 'mae' : 'macro_f1'\}/);
  assert.doesNotMatch(source, /MAE \(menor es mejor\)/);
  assert.doesNotMatch(source, /F1 macro \(mayor es mejor\)/);
});

test('trazabilidad está cerrada inicialmente y se abre a voluntad por modelo', () => {
  assert.match(source, /useState\(false\).*\n\s*const \[predictionPage/);
  assert.match(source, /aria-expanded=\{showPredictionRows\}/);
  assert.match(source, /setShowPredictionRows\(value => !value\)/);
  assert.match(source, /\{showPredictionRows && <>/);
  assert.match(source, /setShowPredictionRows\(false\); setPredictionPage\(1\)/);
  assert.match(source, /predictionRows\.slice/);
});

test('reemplaza corrida por evaluación o ejecución en la interfaz', () => {
  assert.match(source, /Ejecución del experimento/);
  assert.match(source, /ID de ejecución \(opcional\)/);
  assert.doesNotMatch(source, /Comparación general de la corrida/);
  assert.doesNotMatch(source, />Corrida/);
  assert.match(source, /getFinalEvaluations/);
});
