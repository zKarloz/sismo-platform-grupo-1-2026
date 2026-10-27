/** Regresión del contrato visual de fuentes: pruebas estáticas sin navegador. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const page = readFileSync(path.join(root, 'apps/web/src/modules/fuentes-datos/Page.tsx'), 'utf8');
const service = readFileSync(path.join(root, 'apps/web/src/services/seismic.ts'), 'utf8');

test('Fuente visible IGP y automatización por GitHub Actions', () => {
  assert.match(page, /IGP \/ CENSIS/);
  assert.match(page, /Cada hora · GitHub Actions/);
  assert.doesNotMatch(page, /USGS/);
});
test('Paginación compartida, cinco por defecto, logs protegidos', () => {
  assert.match(page, /<TablePagination/);
  assert.match(page, /useState<TablePageSize>\(5\)/);
  assert.match(service, /apiAuthed<IngestionHistory>/);
});
test('Resultados parciales no se confunden con éxito, estados semánticos', () => {
  assert.match(page, /partial: \{ label: 'Parcial'/);
  assert.match(page, /dark:text-emerald-300/);
  assert.match(page, /dark:text-amber-300/);
  assert.match(page, /dark:text-rose-300/);
});
