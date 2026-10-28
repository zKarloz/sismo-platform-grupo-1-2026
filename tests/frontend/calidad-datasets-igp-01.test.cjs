/** Regresiones estáticas: contratos de UI IGP y APIs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const page = read('apps/web/src/modules/calidad-datos/Page.tsx');
const client = read('apps/web/src/services/quality.ts');
const route = read('services/api/app/routes/quality.py');
const service = read('services/api/app/quality/service.py');

test('calidad ofrece pestañas con informes y trazabilidad reales', () => {
  assert.match(page, /'datasets', 'Datasets'/);
  assert.match(page, /'calidad', 'Calidad'/);
  assert.match(page, /'trazabilidad', 'Trazabilidad'/);
  assert.match(page, /getDatasetIntegrity/);
  assert.match(page, /getDatasetPreview/);
});
test('acciones en encabezado con filtros en Modal compartido, actualización y CSV', () => {
  assert.match(page, /<Modal open=\{filtersOpen\} title="Filtros"/);
  assert.match(page, /> Filtros<\/button>/);
  assert.match(page, /> Actualizar<\/button>/);
  assert.match(page, /> CSV<\/button>/);
  assert.match(page, /downloadCsv/);
});
test('tablepagination sirve páginas reales de 5, 10 y 20', () => {
  assert.match(page, /useState<TablePageSize>\(5\)/);
  assert.match(page, /<TablePagination/);
  assert.match(client, /page=\$\{page\}&page_size=\$\{pageSize\}/);
});
test('API y snapshot limitados a IGP/CENSIS con filtro servidor', () => {
  assert.match(route, /IGP_DATASET/);
  assert.match(route, /_require_igp_filter/);
  assert.match(service, /require_igp_source\(filters.source\)/);
  assert.match(service, /"source": IGP_SOURCE/);
  assert.match(client, /source: 'IGP\/CENSIS'/);
});
test('no se presentan aprobaciones o entrenamientos ficticios', () => {
  assert.match(page, /La aprobación formal del dataset/);
  assert.doesNotMatch(page, /Aprobar dataset<\/button>/);
  assert.doesNotMatch(page, /Entrenar ahora<\/button>/);
});
