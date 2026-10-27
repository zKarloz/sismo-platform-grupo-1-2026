/** Pruebas de fechas/hora del formulario sin iniciar React ni FastAPI.
 * La implementación real se transpila con TypeScript del frontend.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {createRequire} = require('node:module');
const root = resolve(__dirname, '../..');
const page = readFileSync(resolve(root, 'apps/web/src/modules/reportes/Page.tsx'), 'utf8');
const utilFile = resolve(root, 'apps/web/src/modules/reportes/reportDateTime.ts');
const ts = createRequire(resolve(root, 'apps/web/package.json'))('typescript');
const transpiled = ts.transpileModule(readFileSync(utilFile, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
});
const mod = {exports:{}};
new Function('module', 'exports', transpiled.outputText)(mod, mod.exports);
const {withDefaultReportTime, reportLocalTimeToUtc} = mod.exports;

test('día nuevo: desde a 00:00 y hasta a 23:59', () => {
  assert.equal(withDefaultReportTime('', '2026-10-27T13:35', 'start_at'), '2026-10-27T00:00');
  assert.equal(withDefaultReportTime('', '2026-10-27T13:35', 'end_at'), '2026-10-27T23:59');
  assert.equal(withDefaultReportTime('2026-10-27T08:30', '2026-10-28T08:30', 'end_at'), '2026-10-28T23:59');
});

test('hora modificada manualmente se conserva y el campo se puede limpiar', () => {
  assert.equal(withDefaultReportTime('2026-10-27T00:00', '2026-10-27T06:30', 'start_at'), '2026-10-27T06:30');
  assert.equal(withDefaultReportTime('2026-10-27T23:59', '2026-10-27T17:45', 'end_at'), '2026-10-27T17:45');
  assert.equal(withDefaultReportTime('2026-10-27T17:45', '', 'end_at'), '');
});

test('rango UTC abarca el último minuto completo, incluso los microsegundos', () => {
  const start = reportLocalTimeToUtc('2026-10-27T00:00');
  const end = reportLocalTimeToUtc('2026-10-27T23:59', true);
  const millisStart = new Date(start).getTime();
  const millisEnd = new Date(end).getTime();
  assert.equal(millisEnd-millisStart, 86399999);
  assert.match(end, /:59\.999999Z$/);
  const early = reportLocalTimeToUtc('2026-10-27T06:30');
  assert.equal(new Date(early).getSeconds(), 0);
});

test('formulario utiliza valores por defecto y conserva el envío a la API', () => {
  assert.match(page, /onChange=\{e=>updatePeriod\('start_at',e\.target\.value\)\}/);
  assert.match(page, /onChange=\{e=>updatePeriod\('end_at',e\.target\.value\)\}/);
  assert.match(page, /reportLocalTimeToUtc\(form\.start_at\)/);
  assert.match(page, /reportLocalTimeToUtc\(form\.end_at,true\)/);
});
