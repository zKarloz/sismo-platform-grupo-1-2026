/** Regresión del único gráfico, panel del Dashboard y restricción IGP. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const page = read('apps/web/src/modules/analisis/Page.tsx');
const sidebar = read('apps/web/src/components/analytics/AppliedFiltersAside.tsx');
const filterBar = read('apps/web/src/components/analytics/FilterBar.tsx');
const backend = read('services/api/app/routes/analytics.py');

test('un gráfico activo y solo una consulta de gráfico por selección', () => {
  assert.match(page, /type ChartId = 'timeseries' \| 'magnitudes' \| 'scatter'/);
  assert.match(page, /<ChartSwitcher choices=\{choices\}/);
  assert.match(page, /chart === 'timeseries'\s*\? <SeriesChart/);
  assert.match(page, /chart === 'magnitudes'\s*\? <MagnitudesChart/);
  assert.match(page, /: <DepthScatterChart/);
  assert.match(page, /chart === 'timeseries'\s*\? getTimeSeries/);
  assert.match(page, /: getScatter\(igpFilters/);
  assert.doesNotMatch(page, /Promise\.all\(\[getTimeSeries, getMagnitudes, getScatter\]/);
});

test('botones Filtros, Actualizar y CSV al lado derecho', () => {
  assert.match(page, /<header className="flex flex-wrap items-end justify-between/);
  assert.match(page, /<FilterBar currentMonthDefault monthPicker reportedDepartmentSelection=/);
  for (const label of ['Filtros','Actualizar','CSV']) assert.ok(filterBar.includes(label));
  assert.match(filterBar, /<Modal open=\{open\}/);
});

test('reutiliza el panel estrecho de Dashboard sin duplicarlo', () => {
  assert.match(page, /import AppliedFiltersAside from/);
  assert.match(page, /xl:flex-row/);
  assert.match(page, /<AppliedFiltersAside filters=\{igpFilters\}/);
  assert.match(sidebar, /xl:w-\[244px\] xl:shrink-0/);
  assert.match(sidebar, /Tamaño de la muestra/);
  assert.match(sidebar, /Datos faltantes para esta visualización/);
  assert.match(sidebar, /Consulta ejecutada \(Perú\)/);
});

test('fuente IGP forzada desde React y desde el backend', () => {
  assert.match(page, /source: 'IGP\/CENSIS'/);
  assert.match(backend, /return replace\(filters, source="IGP\/CENSIS"\)/);
  assert.equal((backend.match(/Depends\(get_igp_analytics_filters\)/g) || []).length, 3);
  assert.match(filterBar, /downloadEventsCsv\(\{/);
});

test('dispersión muestra tamaño de muestra y límite real; CSV no inventa registros', () => {
  assert.match(page, /scatter\.returned/);
  assert.match(page, /scatter\?\.truncated/);
  assert.match(page, /summary\.total - scatter\.total/);
  assert.match(page, /CSV exporta eventos del conjunto filtrado/);
});
