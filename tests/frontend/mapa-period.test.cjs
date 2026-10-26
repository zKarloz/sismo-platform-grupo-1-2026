/** Regresión del período civil de Perú y del filtro defensivo del mapa.
 * Ejecutar desde raíz: node --test tests/frontend/mapa-period.test.cjs
 * Requiere TypeScript, incluido en las dependencias de desarrollo del frontend.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
let ts;
try { ts = require(path.join(root, 'apps/web/node_modules/typescript')); }
catch { ts = require('typescript'); }
const file = path.join(root, 'apps/web/src/lib/peruMonth.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  fileName: file,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const moduleOut = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputText)(moduleOut, moduleOut.exports, require);
const { currentPeruMonth, withCurrentPeruMonth, matchesPeruPeriod } = moduleOut.exports;

test('Mes de Perú cuando todavía es octubre en Lima y noviembre en UTC', () => {
  const period = currentPeruMonth(new Date('2026-11-01T04:59:59Z'));
  assert.equal(period.start_time, '2026-10-01T00:00:00-05:00');
  assert.equal(period.end_time, '2026-10-31T23:59:59.999-05:00');
});

test('El mes se aplica cuando las fechas están ausentes o vacías y fuerza IGP', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  for (const input of [{ source: 'USGS' }, { source: 'USGS', start_time: '', end_time: '' }]) {
    const filters = withCurrentPeruMonth(input, now);
    assert.equal(filters.source, 'IGP/CENSIS');
    assert.equal(filters.start_time, '2026-10-01T00:00:00-05:00');
    assert.equal(filters.end_time, '2026-10-31T23:59:59.999-05:00');
  }
});

test('Un período aplicado manualmente prevalece sobre el mes predeterminado', () => {
  const filters = withCurrentPeruMonth({ start_time: '2024-01-01T00:00:00-05:00', end_time: '2024-12-31T23:59:59.999-05:00' }, new Date('2026-10-26T12:00:00Z'));
  assert.equal(filters.start_time, '2024-01-01T00:00:00-05:00');
  assert.equal(filters.end_time, '2024-12-31T23:59:59.999-05:00');
});

test('No se dibujan eventos fuera del mes peruano, incluidos bordes UTC', () => {
  const filters = currentPeruMonth(new Date('2026-10-26T12:00:00Z'));
  assert.equal(matchesPeruPeriod('2026-10-01T04:59:59Z', filters), false);
  assert.equal(matchesPeruPeriod('2026-10-01T05:00:00Z', filters), true);
  assert.equal(matchesPeruPeriod('2026-11-01T04:59:59.999Z', filters), true);
  assert.equal(matchesPeruPeriod('2026-11-01T05:00:00Z', filters), false);
  assert.equal(matchesPeruPeriod('fecha-inválida', filters), false);
});

test('Febrero bisiesto tiene 29 días completos', () => {
  const period = currentPeruMonth(new Date('2024-02-15T12:00:00Z'));
  assert.equal(period.end_time, '2024-02-29T23:59:59.999-05:00');
});
