/** Regresión de la revisión 02: pestañas y observaciones visuales del IGP. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const source = readFileSync(path.resolve(__dirname, '../../apps/web/src/modules/fuentes-datos/Page.tsx'), 'utf8');

test('La vista se divide en dos pestañas excluyentes, como Auditoría', () => {
  assert.match(source, /useState<'ultima' \| 'historial'>\('ultima'\)/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /Última sincronización/);
  assert.match(source, /Historial de sincronizaciones/);
  assert.match(source, /activeTab === 'ultima' && <div/);
  assert.match(source, /activeTab === 'historial' && <section/);
  assert.match(source, /role="tabpanel"/);
});

test('La consulta paginada se activa solo al consultar el historial', () => {
  assert.match(source, /if \(activeTab !== 'historial'\) return;/);
  assert.match(source, /getIGPRuns\(page, pageSize, status, controller\.signal\)/);
  assert.match(source, /<TablePagination/);
  assert.match(source, /useState<TablePageSize>\(5\)/);
});

test('La duración se presenta en la fila, pero no se duplica al desplegar detalles', () => {
  assert.match(source, /<th[^>]*>Duración<\/th>/);
  assert.match(source, /formatDuration\(run\.duration_seconds\)/);
  const detail = source.split("{expandedId === run.id && <tr")[1];
  assert.ok(detail, 'Existe la fila expandible');
  assert.doesNotMatch(detail, /<span className="text-muted">Duración:/);
  assert.match(detail, /Finalización:/);
  assert.match(detail, /Actualizados:/);
  assert.match(detail, /ID ejecución:/);
});

test('Las observaciones usan fondo amarillo en claro y ámbar en oscuro', () => {
  assert.match(source, /bg-yellow-50/);
  assert.match(source, /dark:bg-amber-950\/50/);
  assert.match(source, /border-yellow-300/);
  assert.match(source, /dark:border-amber-700/);
  assert.match(source, /run\.error_summary/);
  assert.match(source, /Parcial: no significa que el catálogo se haya sincronizado completamente/);
});

test('No se altera la automatización ni la fuente IGP visible', () => {
  assert.match(source, /Cada hora · GitHub Actions/);
  assert.match(source, /IGP \/ CENSIS/);
  assert.doesNotMatch(source, /USGS/);
});
