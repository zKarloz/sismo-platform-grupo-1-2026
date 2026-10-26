/** Pruebas puras del recorte espacial; no necesitan servicios externos. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const ts = require(path.resolve(__dirname, '../../apps/web/node_modules/typescript'));
const source = path.resolve(__dirname, '../../apps/web/src/lib/peruDepartments.ts');
const code = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const moduleObj = {exports: {}};
new Function('module','exports',code)(moduleObj, moduleObj.exports);
const {PERU_DEPARTMENTS, pointInDepartment, departmentBounds} = moduleObj.exports;
const boundary = {
  department: 'LIMA', scope: 'limites_referenciales', source: 'fuente de prueba',
  features: [{type:'Feature', geometry: {type:'MultiPolygon', coordinates: [
    [ [[0,0],[10,0],[10,10],[0,10],[0,0]], [[3,3],[7,3],[7,7],[3,7],[3,3]] ],
    [ [[20,0],[24,0],[24,4],[20,4],[20,0]] ],
  ]}}],
};
test('selector: incluye los 25 departamentos de Perú', () => {
  assert.equal(PERU_DEPARTMENTS.length, 25);
  assert.ok(PERU_DEPARTMENTS.some(([code]) => code === 'CALLAO'));
});
test('polígono incluye puntos interiores y sobre el límite', () => {
  assert.equal(pointInDepartment([1,1],boundary), true);
  assert.equal(pointInDepartment([0,5],boundary), true);
});
test('polígono excluye una zona hueca y un punto fuera del límite', () => {
  assert.equal(pointInDepartment([5,5],boundary), false);
  assert.equal(pointInDepartment([14,8],boundary), false);
});
test('polígono multiparte incluye islas', () => {
  assert.equal(pointInDepartment([22,2],boundary), true);
});
test('caja de SQL contiene todas las partes y no representa el filtro exacto', () => {
  assert.deepEqual(departmentBounds(boundary), {min_lat:0,max_lat:10,min_lon:0,max_lon:24});
});
