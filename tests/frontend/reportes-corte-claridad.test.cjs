/** Regresión: Reportes conserva el corte en el historial, sin tercera tarjeta KPI. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const code = readFileSync(resolve(__dirname, '../../apps/web/src/modules/reportes/Page.tsx'), 'utf8');

test('Solo se muestran dos tarjetas KPI; el corte sigue disponible en la tabla', () => {
  assert.match(code, /Reportes registrados/);
  assert.match(code, /Tipos habilitados/);
  assert.match(code, /<section className="grid gap-3 sm:grid-cols-2">/);
  assert.doesNotMatch(code, /<CalendarClock/);
  assert.doesNotMatch(code, /Se fija al generar el reporte/);
  assert.match(code, /'Fecha de corte'/);
  assert.match(code, /selectedReport\.cutoff_at/);
});
