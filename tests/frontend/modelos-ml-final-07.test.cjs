// Pruebas estructurales: no sustituyen una compilación Vite en la máquina del usuario.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(process.cwd(), name), 'utf8');

test('migración 012 es append-only y exige aprobación real', () => {
  const sql=read('database/migrations/012_ML_IGP_03_PRUEBA_FINAL_2025.sql');
  assert.match(sql, /ml_final_batches/);
  assert.match(sql, /dataset_reviews/);
  assert.match(sql, /r\.decision = 'approved'/);
  assert.match(sql, /reject_dataset_mutation/);
});
test('la CLI no abre 2025 en check-only y exige commit explícito', () => {
  const cli=read('services/api/app/commands/evaluate_igp_2025.py');
  assert.match(cli, /add_mutually_exclusive_group/);
  assert.match(cli, /--check-only/);
  assert.match(cli, /--commit/);
  assert.match(read('services/api/app/ml/igp_final.py'), /year_2025_opened': False/);
});
test('la UI solo muestra resultados finales persistidos y conserva validación 2024', () => {
  const page=read('apps/web/src/modules/modelos-ml/Page.tsx');
  assert.match(page, /getFinalEvaluations/);
  assert.match(page, /Prueba final independiente · IGP 2025/);
  assert.match(page, /getValidationPredictions/);
  assert.match(page, /No se pudo verificar la evaluación final/);
});
