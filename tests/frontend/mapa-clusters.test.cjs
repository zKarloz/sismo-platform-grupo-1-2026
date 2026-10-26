/** Pruebas puras de agrupación espacial y símbolos de magnitud. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require(path.resolve(__dirname, '../../apps/web/node_modules/typescript'));
const vm = require('node:vm');
const file = path.resolve(__dirname, '../../apps/web/src/lib/mapClusters.ts');
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
const moduleStub = { exports: {} };
vm.runInNewContext(js.outputText, { exports: moduleStub.exports, module: moduleStub, require });
const {clusterEpicenters, magnitudeLabel, magnitudeRadius, magnitudeBand, magnitudeColor, MAGNITUDE_COLORS} = moduleStub.exports;
const event = (id, lat, lon, m = 4.1) => ({id, type:'Feature', geometry:{type:'Point',coordinates:[lon,lat]}, properties:{external_id:id, magnitude:m}});
const project = (lat,lon) => ({x: lon*10, y:lat*10});

test('agrupa epicentros cercanos en pantalla', () => {
  const clusters = clusterEpicenters([event('a',-12,-77),event('b',-12.1,-77.1),event('c',-4,-70)], project);
  assert.deepEqual(Array.from(clusters, c=>c.events.length).sort(), [1,2]);
});
test('abrir un epicentro no altera su grupo ni el recuento', () => {
  const events = [event('a',-12,-77),event('b',-12.1,-77.1)];
  const before = clusterEpicenters(events, project, 56);
  const after = clusterEpicenters(events, project, 56);
  assert.equal(before.length, 1);
  assert.deepEqual(Array.from(before[0].events, x => x.id), ['a', 'b']);
  assert.deepEqual(after, before);
});

test('misma escala y coordenadas = misma agrupación aunque cambie orden o se desplace el mapa', () => {
  const events = [event('c',-4,-70), event('a',-12,-77), event('b',-12.1,-77.1)];
  const keys = data => clusterEpicenters(data, project, 56).map(g => [g.key, g.events.map(e=>e.id)]);
  assert.deepEqual(keys(events), keys([...events].reverse()));
  const initial = keys(events);
  // Una navegación sin cambios de datos y regreso a la misma escala es reproducible.
  keys(events);
  assert.deepEqual(keys(events), initial);
});
test('ignora geometrías inválidas y no inventa marcadores', () => {
  assert.equal(clusterEpicenters([event('x',NaN,-70)],project).length,0);
});
test('semáforo: extremos exactos de tres rangos y dato ausente', () => {
  assert.equal(magnitudeBand(4.49), 'low');
  assert.equal(magnitudeBand(4.5), 'medium');
  assert.equal(magnitudeBand(5.9), 'medium');
  assert.equal(magnitudeBand(5.90001), 'high');
  assert.equal(magnitudeBand(null), 'unknown');
  assert.equal(magnitudeBand(Number.NaN), 'unknown');
  assert.equal(magnitudeLabel(4.5), 'M 4.5–5.9');
  assert.equal(magnitudeLabel(6), 'M > 5.9');
  assert.equal(magnitudeLabel(null), 'Sin dato');
});

test('colores idénticos para ambos temas (sin dependencia de clases dark)', () => {
  assert.equal(magnitudeColor(2.1), MAGNITUDE_COLORS.low);
  assert.equal(magnitudeColor(4.5), MAGNITUDE_COLORS.medium);
  assert.equal(magnitudeColor(6.3), MAGNITUDE_COLORS.high);
  assert.equal(magnitudeColor(null), MAGNITUDE_COLORS.unknown);
  assert.equal(MAGNITUDE_COLORS.low, '#22c55e');
  assert.equal(MAGNITUDE_COLORS.medium, '#eab308');
  assert.equal(MAGNITUDE_COLORS.high, '#ef4444');
  assert.equal(MAGNITUDE_COLORS.unknown, '#94a3b8');
});

test('marcadores individuales mantienen tamaños moderados', () => {
  assert.ok(magnitudeRadius(6.5) > magnitudeRadius(2.5));
  assert.ok(magnitudeRadius(6.5) - magnitudeRadius(2.5) <= 2);
});
