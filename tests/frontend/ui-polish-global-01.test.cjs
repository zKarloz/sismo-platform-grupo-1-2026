/* Regresiones de UX: sidebar, menú y scrollbars; sin servicios externos. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const layout = read('apps/web/src/app/AppLayout.tsx');
const css = read('apps/web/src/index.css');
const page = read('apps/web/src/modules/modelos-ml/Page.tsx');

test('sidebar y topbar comparten superficie y conservan contraste con el contenido', () => {
  assert.match(layout, /border-r border-border-ui bg-panel text-main transition-transform/);
  assert.match(layout, /bg-panel\/95/);
  assert.match(css, /--ui-sidebar:\s*var\(--ui-panel\)/);
  assert.match(css, /--ui-sidebar-active:\s*var\(--ui-accent-soft\)/);
});
test('sidebar tiene scrollbar minimalista y conserva navegación', () => {
  assert.match(layout, /aria-label="Módulos principales" className="ui-thin-scrollbar /);
  assert.match(css, /\.ui-thin-scrollbar::-webkit-scrollbar \{ width: 6px; height: 6px; \}/);
  assert.match(css, /scrollbar-width: thin/);
});
test('perfil compacto en móviles con etiqueta accesible', () => {
  assert.match(layout, /aria-label="Abrir menú de usuario"/);
  assert.match(layout, /ui-profile-trigger size-10 justify-center/);
  assert.match(layout, /hidden min-w-0 truncate sm:inline/);
  assert.match(layout, /hidden shrink-0 text-muted transition-transform sm:block/);
});
test('la tarjeta de usuario permanece montada y anima apertura y cierre', () => {
  assert.match(layout, /ui-profile-popover/);
  assert.match(layout, /aria-hidden=\{!profileOpen\}/);
  assert.match(layout, /duration-200 ease-out/);
  assert.match(layout, /invisible pointer-events-none -translate-y-1 scale-95 opacity-0/);
  assert.doesNotMatch(layout, /\{profileOpen && \(/);
});
test('todas las tablas desplazables de Modelos ML tienen scrollbar fino', () => {
  const wrappers = [...page.matchAll(/<div\s+className="([^"]*\boverflow-x-auto\b[^"]*)"/g)];
  assert.ok(wrappers.length >= 2);
  for (const [, classes] of wrappers) assert.ok(classes.includes('ui-thin-scrollbar'));
});
test('puntero de mano en controles habilitados, disabled no clickable', () => {
  assert.match(css, /button:not\(:disabled\).*a\[href\]/);
  assert.match(css, /cursor: pointer/);
  assert.match(css, /button:disabled, select:disabled/);
  assert.match(css, /cursor: not-allowed/);
});
