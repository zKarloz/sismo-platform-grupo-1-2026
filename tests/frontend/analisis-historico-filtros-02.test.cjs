/** Regresión: mes/año y departamento reportado en Análisis histórico. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const page = read('apps/web/src/modules/analisis/Page.tsx');
const bar = read('apps/web/src/components/analytics/FilterBar.tsx');
const filters = read('services/api/app/routes/filters.py');
const types = read('apps/web/src/types/analytics.ts');

test('ambos selectores están en el Modal compartido y solo en Análisis', () => {
  assert.match(page, /<FilterBar currentMonthDefault monthPicker reportedDepartmentSelection=/);
  assert.match(bar, /<Modal open=\{open\}/);
  assert.match(bar, /id="analytics-specific-month"/);
  assert.match(bar, /PERU_MONTHS\.map/);
  assert.match(bar, /Año del mes/);
  assert.match(bar, /Departamento indicado en el reporte/);
  assert.match(bar, /monthPicker = false, reportedDepartmentSelection/);
});
test('mes civil de Perú tiene inicio y final inclusivos y desactiva fechas manuales', () => {
  assert.match(bar, /Date\.UTC\(year, month, 0\)/);
  assert.match(bar, /peruDateFilters\(`\$\{value\}-01`/);
  assert.match(bar, /disabled=\{monthPicker && Boolean\(specificMonth\)\}/);
  assert.match(bar, /datesForPeruMonth\(`\$\{specificYear\}-\$\{specificMonth\.slice\(5\)\}`\)/);
});
test('departamento solo afecta consultas de análisis y también CSV', () => {
  assert.match(page, /reportedDepartment \? \{ reported_department: reportedDepartment \}/);
  assert.match(bar, /reportedDepartmentSelection\?\.onChange\(reportedDepartment\)/);
  assert.match(bar, /reported_department: reportedDepartmentSelection.value/);
  assert.match(types, /reported_department\?: string/);
});
test('backend valida departamento y no confunde localidad con polígono administrativo', () => {
  assert.match(filters, /REPORTED_DEPARTMENTS =/);
  assert.match(filters, /reported_department not in REPORTED_DEPARTMENTS/);
  assert.match(filters, /place\.like\(f"% - \{name\}"\)/);
  assert.match(page, /No equivale a los límites administrativos/);
});
