/** Comprobaciones de regresión del modal responsive, sin dependencias nuevas. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('viewport móvil declarado', () => {
  assert.match(read('apps/web/index.html'), /name="viewport"\s+content="width=device-width, initial-scale=1\.0"/);
});
test('auditoría solicita modal móvil compartido', () => {
  assert.match(read('apps/web/src/modules/auditoria/Page.tsx'), /<Modal\s+open=\{filtersOpen\}[^>]*mobileSheet/);
});
test('modal importa estilos móviles para el modo mobileSheet', () => {
  const code = read('apps/web/src/components/ui/Modal.tsx');
  assert.match(code, /import '\.\/modalMobile\.css'/);
  assert.match(code, /sismo-modal-mobile-overlay/);
  assert.match(code, /sismo-modal-mobile-panel/);
  assert.match(code, /sismo-modal-mobile-body/);
  assert.match(code, /sismo-modal-mobile-footer/);
});
test('modal móvil restringe panel, campos y altura', () => {
  const css = read('apps/web/src/components/ui/modalMobile.css');
  assert.match(css, /max-width:\s*100%/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /max-height:\s*calc\(100dvh - 0\.5rem\)/);
  assert.match(css, /input\[type='date'\]/);
  assert.match(css, /overflow-y:\s*auto/);
});
