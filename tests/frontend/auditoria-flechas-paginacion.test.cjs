/** Pruebas de regresión: controles de historial de Auditoría (sin dependencias extras). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../apps/web/src/modules/auditoria/Page.tsx'), 'utf8');

test('la flecha usa un único icono orientado hacia abajo por defecto', () => {
  assert.match(source, /<ChevronDown size=\{17\}/);
  assert.doesNotMatch(source, /expanded\s*\?\s*<ChevronUp/);
});

test('la rotación se anima tanto al abrir como al cerrar', () => {
  assert.match(source, /transition-transform duration-200 ease-in-out/);
  assert.match(source, /expanded\?'rotate-180':'rotate-0'/);
  assert.match(source, /motion-reduce:transition-none/);
  assert.match(source, /aria-expanded=\{expanded\}/);
});

test('el paginador solo muestra la página actual y el número de páginas', () => {
  assert.match(source, /Página \{page\} de \{pages\}<\/span>/);
  assert.doesNotMatch(source, /Página \{page\} de \{pages\} · \{total\} en total/);
});
