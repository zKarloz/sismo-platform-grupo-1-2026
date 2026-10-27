/** Regresión de la interfaz compartida de modales; no requiere un navegador. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../apps/web/src');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Reportes usa Modal compartido para sus tres diálogos', () => {
  const src = read('modules/reportes/Page.tsx');
  assert.match(src, /import Modal from ['"]\.\.\/\.\.\/components\/ui\/Modal['"]/);
  assert.match(src, /function Dialog\([\s\S]*?return <Modal open/);
  assert.match(src, /<Dialog title="Generar reporte"/);
  assert.match(src, /<Dialog title="Filtros del reporte generado"/);
  assert.match(src, /<Dialog title="Configuración y retención"/);
  assert.doesNotMatch(src, /fixed inset-0/);
});

test('Generar y descargar tiene contraste correcto en el tema oscuro', () => {
  const src = read('modules/reportes/Page.tsx');
  const start = src.indexOf('dark:bg-neutral-100 dark:text-neutral-900', src.indexOf('function BuildReport'));
  assert.ok(start > 0, 'Faltan las clases del botón Generar y descargar');
  assert.ok(start < src.indexOf('function SettingsDialog'), 'El estilo debe corresponder al botón del formulario');
});

test('Usuarios usa Modal compartido en alta, edición y detalles', () => {
  const src = read('modules/usuarios-roles/UserModal.tsx');
  assert.match(src, /return <Modal open title=\{title\}/);
  assert.match(src, /return <Modal open title="Detalle del usuario"/);
  assert.match(src, /<ModalFrame title="Nuevo usuario"/);
  assert.match(src, /<ModalFrame title="Editar permisos"/);
  assert.doesNotMatch(src, /fixed inset-0/);
});

test('Mis notificaciones usa Modal compartido y bloquea el cierre al guardar', () => {
  const src = read('modules/mis-notificaciones/Page.tsx');
  assert.match(src, /return <Modal open title="Editar mis notificaciones"/);
  assert.match(src, /if \(!saving\) onClose\(\)/);
  assert.doesNotMatch(src, /fixed inset-0/);
});

test('Modales existentes permanecen compartidos', () => {
  const audits = read('modules/auditoria/Page.tsx');
  const filters = read('components/analytics/FilterBar.tsx');
  assert.match(audits, /<Modal open=\{filtersOpen\} title="Filtros" mobileSheet/);
  assert.match(filters, /<Modal open=\{open\}/);
});
