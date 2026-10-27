// Pruebas estáticas mínimas, no sustituyen la compilación de Vite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.join(__dirname, '../../apps/web/src/modules/reportes/Page.tsx');
const text = fs.readFileSync(base, 'utf8');
test('sin selector de fuente ni USGS visible en Reportes', () => {
  assert.equal(text.includes('Fuente de datos'), false);
  assert.equal(text.includes('USGS'), false);
  assert.match(text, /Fuente única: IGP\/CENSIS/);
});
test('mantiene el paginador compartido y 5 registros al abrir', () => {
  assert.match(text, /<TablePagination/);
  assert.match(text, /useState<TablePageSize>\(5\)/);
});
test('los estados se representan a partir del valor real', () => {
  assert.match(text, /<ReportStatus status=\{record\.status\}/);
});
