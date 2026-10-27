/** Prueba estática sin dependencias: previene regresiones del flujo de filtros.
 * La interacción y los tipos TSX se validan además con `npm run build` y en navegador.
 */
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const page = readFileSync(resolve(__dirname, '../../apps/web/src/modules/auditoria/Page.tsx'), 'utf8');

test('usa el modal compartido en lugar de crear un segundo overlay', () => {
  assert.match(page, /import Modal from '\.\.\/\.\.\/components\/ui\/Modal';/);
  assert.match(page, /<Modal open=\{filtersOpen\} title="Filtros"/);
});

test('barra contiene búsqueda, Filtros y exportación en ese orden', () => {
  const search = page.indexOf('placeholder="Buscar usuario, acción o entidad…"');
  const filter = page.indexOf('onClick={openFilters}');
  const exportButton = page.indexOf('onClick={()=>void exportEntries()}');
  assert.ok(search >= 0 && filter > search && exportButton > filter);
});

test('filtros del modal se aplican juntos y reinician la página', () => {
  assert.match(page, /function openFilters\(\)[\s\S]*?setDraftCategory\(category\)/);
  assert.match(page, /function applyFilters\(\)[\s\S]*?setCategory\(draftCategory\);[\s\S]*?setResult\(draftResult\);[\s\S]*?setStartDate\(draftStartDate\);[\s\S]*?setEndDate\(draftEndDate\);[\s\S]*?resetToFirst\(\);/);
  assert.match(page, /disabled=\{draftDateInvalid\}/);
});

test('exportación conserva criterios aplicados y no usa valores del borrador', () => {
  assert.match(page, /downloadAudit\(\{q:query,category,result,start_date:startDate,end_date:endDate\}\)/);
  assert.match(page, /onClick=\{clearDraftFilters\}/);
  assert.match(page, /onClick=\{\(\)=>setFiltersOpen\(false\)\}/);
});
