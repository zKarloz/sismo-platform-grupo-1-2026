/** Regresiones ligeras del módulo Reportes sin servicios externos. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '../..');
const read = file => readFileSync(join(root, file), 'utf8');
const page = read('apps/web/src/modules/reportes/Page.tsx');
const service = read('apps/web/src/services/reports.ts');
const paginator = read('apps/web/src/components/ui/TablePagination.tsx');
const renderer = read('services/api/app/reports/service.py');

// El historial debe solicitar cinco elementos por página, no recortar diez localmente.
test('historial inicia con 5 registros y cambia el tamaño de página en la API', () => {
  assert.match(page, /useState<TablePageSize>\(5\)/);
  assert.match(page, /getReportHistory\(page,pageSize\)/);
  assert.match(page, /\[page,pageSize,tick\]/);
  assert.match(service, /getReportHistory\s*=\s*\(page:number,\s*pageSize:5\|10\|20\s*=\s*10\)/);
  assert.match(service, /page_size=\$\{pageSize\}/);
});

test('Reportes usa el mismo paginador que Usuarios y Auditoría', () => {
  assert.match(page, /import TablePagination from/);
  assert.match(page, /<TablePagination/);
  assert.match(page, /onPageSizeChange=\{size\s*=>\s*\{setPageSize\(size\);setPage\(1\);\}\}/);
  for(const n of [5,10,20]) assert.match(paginator, new RegExp(`<option value=\\{${n}\\}>`));
  assert.match(paginator, /Página \{currentPage\} de \{lastPage\}/);
  assert.doesNotMatch(page, /<span>Página \{page\} de \{history\?\.pages/);
});

test('botón Nuevo reporte conserva el contraste de Nuevo usuario en tema oscuro', () => {
  assert.match(page, /dark:bg-neutral-100 dark:text-neutral-900[^"\n]*" onClick=\{\(\)=>setModal\('new'\)\}/);
});

test('manifiesto contiene generación y vencimiento del registro, no un enlace público', () => {
  assert.match(page, /selectedReport\.created_at/);
  assert.match(page, /selectedReport\.expires_at/);
  assert.match(page, /Los archivos no se guardan en enlaces públicos/);
});

test('archivos CSV/XLSX/PDF no muestran V2 al cliente', () => {
  assert.doesNotMatch(renderer, /Sistema de Monitoreo Sísmico V2/);
  assert.match(renderer, /Sistema de Monitoreo Sísmico/);
});
