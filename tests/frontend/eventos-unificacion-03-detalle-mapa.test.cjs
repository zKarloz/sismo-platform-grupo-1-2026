/** Regresiones UI: fechas legibles, detalles no repetidos y foco del epicentro. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const events = read('apps/web/src/modules/eventos/EventCatalog.tsx');
const map = read('apps/web/src/modules/mapa-sismico/Page.tsx');

test('Fecha UTC ya no usa ISO sin formato en la tabla', () => {
  assert.match(events, /function utcDate\(value: string\)/);
  assert.match(events, /new Intl.DateTimeFormat\('es-PE'/);
  assert.match(events, /timeZone: 'UTC'/);
  assert.match(events, /second: '2-digit'/);
  assert.match(events, /return `\$\{formatted\} UTC`/);
  assert.doesNotMatch(events, /date\.toISOString\(\)\.replace\('\.000Z','Z'\)/);
});

test('La hora de ocurrencia y recepción se presentan ambas en Perú y con nombres diferentes', () => {
  assert.match(events, /\['Ocurrencia \(Perú\)', peruDate\(item\.occurred_at\)\]/);
  assert.match(events, /\['Recepción en el sistema \(Perú\)', peruDate\(item\.received_at\)\]/);
  assert.match(events, /timeZone: 'America\/Lima'/);
});

test('Los detalles solo conservan datos adicionales, no repiten columnas ni mapa embebido', () => {
  const details = events.split('function EventDetails(')[1].split('export default function EventCatalog')[0];
  for (const obsolete of ['sourceMapUrl(', '<iframe', 'Procedencia oficial', 'Ubicación registrada',
    "['Fecha UTC'", "['Tipo de magnitud'", "['Profundidad (km)'", 'Ficha individual IGP', 'Hash de origen']) {
    assert.ok(!details.includes(obsolete), `Dato repetido: ${obsolete}`);
  }
  assert.match(details, /Latitud/);
  assert.match(details, /Longitud/);
});

test('Unreviewed se muestra de forma comprensible, sin atribuir revisión al IGP', () => {
  assert.match(events, /status === 'unreviewed'\) return 'Sin revisión registrada'/);
  assert.match(events, /no certifica una revisión del IGP/);
});

test('La actualización de la fuente es opcional: no mostrar una fecha inventada', () => {
  assert.match(events, /item\.source_updated_at \? \[\['Actualización de la fuente \(Perú\)'/);
});

test('Existe columna Ver en el mapa con vínculo por ID y estado de evento real', () => {
  assert.match(events, />Ver en el mapa<\/th>/);
  assert.match(events, /<Link to=\{mapLink\(item\)\} state=\{mapNavigationState\(item\)\}/);
  assert.match(events, /igp_event: item\.external_id/);
  assert.match(events, /external_id: item\.external_id, occurred_at: item\.occurred_at/);
  assert.match(events, /latitude: item\.latitude, longitude: item\.longitude/);
  assert.match(events, /hasMapLocation\(item\)/);
});

test('El módulo de mapa actual reconoce el parámetro y el igpReport del catálogo', () => {
  assert.match(map, /params\.get\('igp_event'\)/);
  assert.match(map, /igpReport\?: IGPEvent/);
  assert.match(map, /candidate\.external_id === targetId/);
  assert.match(map, /markerRef\.current\.openPopup\(\)/);
});

test('Las filas desplegadas ocupan ahora las ocho columnas', () => {
  assert.match(events, /colSpan=\{8\}/);
  assert.match(events, /className=\{`transition-transform \$\{expanded===item\.id\?'rotate-180':''\}`\}/);
});

test('Noviembre y diciembre no añaden Próximamente', () => {
  assert.match(events, /disabled=\{index\+1>clock\.month\}/);
  assert.match(events, /\{name\}<\/option>/);
  assert.doesNotMatch(events, /Próximamente/);
});
