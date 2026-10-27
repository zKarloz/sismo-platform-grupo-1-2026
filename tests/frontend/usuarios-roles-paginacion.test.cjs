/** Regresiones de estructura del módulo sin conexiones a servicios externos. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '../..');
const read = file => readFileSync(join(root, file), 'utf8');
const page = read('apps/web/src/modules/usuarios-roles/Page.tsx');
const dialog = read('apps/web/src/modules/usuarios-roles/UserModal.tsx');
const paginator = read('apps/web/src/components/ui/TablePagination.tsx');
const audit = read('apps/web/src/modules/auditoria/Page.tsx');

test('usuarios obtiene la primera página de 5 registros usando el backend', () => {
  assert.match(page, /useState<TablePageSize>\(5\)/);
  assert.match(page, /page_size:\s*String\(pageSize\)/);
  assert.match(page, /\/api\/v1\/admin\/users\?/);
});
test('columnas independientes y sin encabezado de fase', () => {
  assert.match(page, />Último acceso<\/th>/);
  assert.match(page, />Fecha de alta<\/th>/);
  assert.doesNotMatch(page, /Administración · Fase 2/);
});
test('etiquetas usan colores semánticos también en tema oscuro', () => {
  assert.match(dialog, /dark:text-emerald-300/);
  assert.match(dialog, /dark:text-amber-300/);
  assert.match(dialog, /dark:text-rose-300/);
  assert.match(page, /'suspended' \? 'warning' : 'danger'/);
});
test('paginador reutilizado en usuarios y auditoría', () => {
  assert.match(page, /<TablePagination/);
  assert.match(audit, /<TablePagination/);
  assert.match(audit, /useState<5\|10\|20>\(10\)/);
  for(const size of [5,10,20]) assert.match(paginator, new RegExp(`<option value=\\{${size}\\}>`));
  assert.match(paginator, /Página \{currentPage\} de \{lastPage\}/);
  assert.match(paginator, /aria-label="Página anterior"/);
  assert.match(paginator, /aria-label="Página siguiente"/);
});
test('detalle muestra permisos limitados a este módulo y MFA no inventado', () => {
  assert.match(dialog, /Permisos del rol en Usuarios y roles/);
  assert.match(dialog, /Información no disponible en la API actual/);
  assert.match(dialog, /user\.role === 'administrador' \|\| user\.role === 'auditor'/);
});
