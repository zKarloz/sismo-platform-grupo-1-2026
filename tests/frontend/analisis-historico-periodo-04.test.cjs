/** Regresiones de la Revisión 04: año numérico y mes actual por defecto.
 * Las verificaciones no requieren credenciales ni acceso a Supabase.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (filename) => fs.readFileSync(path.join(root, filename), 'utf8');
const page = read('apps/web/src/modules/analisis/Page.tsx');
const filterBar = read('apps/web/src/components/analytics/FilterBar.tsx');
const peruMonth = read('apps/web/src/lib/peruMonth.ts');

test('el año se edita con un control numérico nativo y flechas, entre 1960 y 2026', () => {
  assert.match(filterBar, /const MIN_ANALYSIS_YEAR = 1960;/);
  assert.match(filterBar, /const MAX_ANALYSIS_YEAR = 2026;/);
  assert.match(filterBar, /<input type="number" id="analytics-specific-year" aria-label="Año del mes"/);
  assert.match(filterBar, /min=\{MIN_ANALYSIS_YEAR\} max=\{MAX_ANALYSIS_YEAR\} step=\{1\}/);
  assert.doesNotMatch(filterBar, /<select aria-label="Año del mes"/);
  assert.doesNotMatch(filterBar, /PERU_YEARS/);
});

test('al aplicar filtros se rechaza un año no válido o incompleto antes de calcular fechas', () => {
  assert.match(filterBar, /!\/\^\\d\{4\}\$\/\.test\(specificYear\)/);
  assert.match(filterBar, /Number\(specificYear\) < MIN_ANALYSIS_YEAR/);
  assert.match(filterBar, /Number\(specificYear\) > MAX_ANALYSIS_YEAR/);
  assert.match(filterBar, /if \(monthPicker && specificMonth && !selectedMonthDates\)/);
  assert.match(filterBar, /selectedMonthDates \?\? peruDateFilters\(start, end\)/);
  assert.match(filterBar, /onBlur=\{\(\) => \{/);
  assert.match(filterBar, /Math\.max\(MIN_ANALYSIS_YEAR, Math\.min\(MAX_ANALYSIS_YEAR, parsed\)\)/);
});

test('los tres gráficos y el panel lateral comparten el mes actual de Perú por defecto', () => {
  assert.match(page, /withCurrentPeruMonth\(filters\)/);
  assert.match(page, /source: 'IGP\/CENSIS'/);
  assert.match(page, /getSummary\(igpFilters, controller\.signal\)/);
  assert.match(page, /getTimeSeries\(igpFilters, interval, controller\.signal\)/);
  assert.match(page, /getMagnitudes\(igpFilters, controller\.signal\)/);
  assert.match(page, /getScatter\(igpFilters, controller\.signal\)/);
  assert.match(page, /<AppliedFiltersAside filters=\{igpFilters\}/);
});

test('el CSV y el botón Limpiar respetan el mismo mes predeterminado, sin afectar al Dashboard', () => {
  assert.match(page, /<FilterBar currentMonthDefault monthPicker reportedDepartmentSelection=/);
  assert.match(filterBar, /currentMonthDefault = false/);
  assert.match(filterBar, /currentMonthDefault \? currentPeruMonth\(\) : \{\}/);
  assert.match(filterBar, /currentMonthDefault \? withCurrentPeruMonth\(filters\) : filters/);
  assert.match(filterBar, /downloadEventsCsv\(\{/);
  assert.match(peruMonth, /timeZone: 'America\/Lima'/);
  assert.match(peruMonth, /T00:00:00-05:00/);
  assert.match(peruMonth, /T23:59:59\.999-05:00/);
});

test('la serie temporal se agrupa por día para evitar un único punto mensual', () => {
  assert.match(page, /useState<'day' \| 'month'>\('day'\)/);
  assert.match(page, /<option value="day">Día \(UTC\)<\/option>/);
  assert.match(page, /<option value="month">Mes \(UTC\)<\/option>/);
});
