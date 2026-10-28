/** Regresión de usabilidad del modal de Análisis histórico. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../apps/web/src/components/analytics/FilterBar.tsx'), 'utf8');
const page = fs.readFileSync(path.resolve(__dirname, '../../apps/web/src/modules/analisis/Page.tsx'), 'utf8');

test('modal se llama Filtros y no conserva textos informativos solicitados', () => {
  assert.match(source, /<Modal open=\{open\}/);
  assert.match(source, /title="Filtros"/);
  assert.doesNotMatch(source, /Filtros compartidos/);
  assert.doesNotMatch(source, /Selecciona mes y año\. Sustituye las fechas manuales/);
  assert.doesNotMatch(source, /Coincide con la etiqueta de departamento escrita por IGP/);
});

test('mes es select con los doce meses y no input month', () => {
  assert.match(source, /<select id="analytics-specific-month"/);
  assert.match(source, /PERU_MONTHS\.map\(\(name, index\)/);
  assert.doesNotMatch(source, /type="month"/);
  for (const month of ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']) {
    assert.ok(source.includes(month), `No aparece el mes ${month}`);
  }
  assert.match(source, /Sin mes específico/);
});

test('año independiente evita mezclar meses de distintos años', () => {
  assert.match(source, /aria-label="Año del mes"/);
  assert.match(source, /CURRENT_PERU_YEAR/);
  assert.match(source, /type="number" id="analytics-specific-year"/);
  assert.match(source, /min=\{MIN_ANALYSIS_YEAR\} max=\{MAX_ANALYSIS_YEAR\} step=\{1\}/);
  assert.doesNotMatch(source, /PERU_YEARS/);
  assert.match(source, /timeZone: 'America\/Lima'/);
  assert.match(source, /setSpecificMonth\(event\.target\.value \?/);
  assert.match(source, /setSpecificMonth\(`\$\{year\}-\$\{specificMonth\.slice\(5\)\}`\)/);
  assert.match(source, /datesForPeruMonth\(`\$\{specificYear\}-\$\{specificMonth\.slice\(5\)\}`\)/);
  assert.match(source, /peruDateFilters\(`\$\{value\}-01`/);
});

test('al limpiar el mes se liberan las fechas para consulta personalizada', () => {
  assert.match(source, /setStart\(''\); setEnd\(''\);/);
  assert.match(source, /disabled=\{monthPicker && Boolean\(specificMonth\)\}/);
  assert.match(source, /selectedPeruMonth\(localStart, localEnd\)/);
});

test('no afecta módulos que no usan selector mensual ni filtro departamental', () => {
  assert.match(source, /monthPicker = false/);
  assert.match(source, /\{monthPicker && <div/);
  assert.match(source, /\{reportedDepartmentSelection && <label/);
  assert.match(page, /<FilterBar currentMonthDefault monthPicker reportedDepartmentSelection=/);
});
