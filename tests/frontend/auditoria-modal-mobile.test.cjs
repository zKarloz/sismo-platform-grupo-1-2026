/** Verificaciones de regresión del modal de filtros de Auditoría, sin APIs externas. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '../..');
const audit = readFileSync(join(root, 'apps/web/src/modules/auditoria/Page.tsx'), 'utf8');
const modal = readFileSync(join(root, 'apps/web/src/components/ui/Modal.tsx'), 'utf8');

test('Auditoría activa solo su presentación móvil; el resto conserva el modal habitual', () => {
  assert.match(audit, /<Modal open=\{filtersOpen\} title="Filtros" mobileSheet/);
  assert.match(modal, /mobileSheet = false/);
  assert.match(modal, /items-end p-0 sm:items-center sm:p-6/);
});

test('El panel cabe en la altura visible y el cuerpo se desplaza verticalmente', () => {
  assert.match(modal, /100dvh/);
  assert.match(modal, /overflow-y-auto overscroll-contain/);
  assert.match(modal, /overflow-x-hidden/);
  assert.match(modal, /safe-area-inset-bottom/);
});

test('Fechas y selectores no fuerzan un ancho superior al teléfono', () => {
  assert.match(audit, /fieldset className="min-w-0 max-w-full/);
  assert.match(audit, /grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2/);
  assert.equal((audit.match(/block w-full min-w-0 max-w-full/g) || []).length, 4);
});

test('Botones de Limpiar, Cancelar y Aplicar visibles y adaptados a móvil', () => {
  assert.match(audit, /grid w-full min-w-0 grid-cols-2 gap-2 sm:flex/);
  assert.match(audit, /className="col-span-2 rounded-lg/);
  assert.match(audit, /onClick=\{applyFilters\} disabled=\{draftDateInvalid\}/);
});

test('Mantiene la regla: solo aplicar filtros modifica los criterios consultados', () => {
  assert.match(audit, /function applyFilters\(\)/);
  assert.match(audit, /setCategory\(draftCategory\)/);
  assert.match(audit, /setResult\(draftResult\)/);
  assert.match(audit, /setStartDate\(draftStartDate\)/);
  assert.match(audit, /setEndDate\(draftEndDate\)/);
});
