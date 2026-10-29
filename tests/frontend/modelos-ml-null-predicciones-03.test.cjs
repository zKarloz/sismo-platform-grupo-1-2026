/** Regresión de TypeScript: predictionResult puede ser null durante la carga. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(__dirname, '../../apps/web/src/modules/modelos-ml/Page.tsx'), 'utf8');

test('TS18047: se valida el objeto antes de acceder a sus items', () => {
  assert.match(page, /predictionResult\s*&&\s*predictionResult\.experiment_id\s*===\s*modelId\s*\?\s*predictionResult\.items\s*:\s*\[\]/);
  assert.doesNotMatch(page, /predictionResult\?\.experiment_id\s*===\s*modelId\s*\?\s*predictionResult\.items/);
});

test('no se regresa en el fix anterior de la bandera baseline desconocida', () => {
  assert.match(page, /row\.params\.baseline === true &&/);
  assert.doesNotMatch(page, /row\.params\.baseline &&/);
});

test('la validación mantiene pares del modelo seleccionado y reserva 2025', () => {
  assert.match(page, /getValidationPredictions\(modelId,/);
  assert.match(page, /predictionRows\.slice/);
  assert.match(page, /2025.*reservad/);
});
