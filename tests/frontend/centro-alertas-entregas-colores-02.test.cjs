/** Regresión Fase E: solo la observación usa el color semántico de advertencia. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const page = fs.readFileSync(path.resolve(__dirname, '../../apps/web/src/modules/alertas/Page.tsx'), 'utf8');

test('en escritorio la fila expandida es neutra y mantiene el ancho completo', () => {
  assert.match(page, /expandedDeliveryId === item\.id && <tr className="bg-panel-alt\/40">/);
  assert.match(page, /<td colSpan=\{7\} id=\{`entrega-escritorio-\$\{item\.id\}`\}/);
  assert.match(page, /className="border-t border-border-ui px-4 py-4"/);
  assert.doesNotMatch(page, /<tr className="bg-yellow-50/);
});

test('en móvil el panel expandido también mantiene fondo neutro', () => {
  assert.match(page, /className="mt-3 rounded-lg border border-border-ui bg-panel-alt\/40 p-3"/);
  assert.doesNotMatch(page, /className="mt-3 rounded-lg border border-yellow-300 bg-yellow-50/);
});

test('solo la tarjeta de observación presenta amarillo claro y ámbar oscuro', () => {
  const matches = page.match(/bg-yellow-100\/80/g) || [];
  assert.equal(matches.length, 1);
  assert.match(page, /rounded-lg border border-yellow-300 bg-yellow-100\/80 p-3 text-yellow-900 dark:border-amber-700 dark:bg-amber-950\/65 dark:text-amber-200/);
  assert.match(page, /<strong>Observación:<\/strong>.*\{observation\}/);
});

test('datos y enlace del panel conservan colores neutros de ambos temas', () => {
  assert.match(page, /return <div className="space-y-3 text-xs text-main">/);
  assert.match(page, /<dt className="text-muted">Creación \(Perú\)<\/dt>/);
  assert.match(page, /rel="noopener noreferrer" className="inline-flex font-semibold text-main underline/);
});

test('mantiene flecha giratoria y estados separados de caducidad', () => {
  assert.equal((page.match(/expandedDeliveryId === item\.id \? 'rotate-180' : ''/g)||[]).length, 2);
  assert.match(page, /isExpiredDelivery\(item\) \? 'Caducada'/);
});
