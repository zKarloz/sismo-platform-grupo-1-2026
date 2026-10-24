# Corrección de ingesta IGP — reportes con fecha ausente

## Incidente reproducido

El comando `python -m app.commands.sync_igp --limit 20` fallaba con
`IGPFeedError: Fecha IGP inválida o ausente` porque `query(..., strict=True)`
abortaba el lote completo al encontrar una sola fila con fecha inválida.
Las fechas no se deben inferir ni inventar.

## Corrección

- `services/api/app/igp/client.py`: prueba `fechaevento` y después `fecha`;
  conserva la conversión de fechas ArcGIS UTC a `America/Lima` antes de extraer
  el día. `query()` sigue siendo una lista compatible con la API existente y
  añade metadatos internos de filas consultadas y omitidas.
- `services/api/app/ingestion/igp.py`: descarta exclusivamente registros que
  no permiten una identificación/fecha segura; almacena los demás con `upsert`
  idempotente. Si hubo descartes, anota `status='partial'` y deja el motivo
  en `ingestion_runs.error_summary`. `records_seen` cuenta los registros
  recibidos, `processed` los códigos válidos únicos y `skipped` los rechazados.
  `last_success_at` solo cambia cuando el lote es totalmente válido.
- `services/api/app/commands/sync_igp.py`: comunica explícitamente `PARCIAL`
  y los conteos, en lugar de afirmar un éxito completo.
- `tests/backend/test_igp_partial.py`: prueba mezcla de registros válidos e
  inválidos, fecha alternativa y código no estable; no usa Supabase real.

## Instalación en Git Bash

Desde la raíz del proyecto:

```bash
unzip -o ~/Downloads/sismo-platform-parche-igp-fechas-nulas.zip -d .
cd services/api
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
python -m app.commands.sync_igp --limit 20
python -m app.commands.sync_igp --limit 20
```

Si aparece `PARCIAL`, los eventos válidos sí se almacenaron, pero debe
revisarse la calidad del lote; no significa catálogo completo. Ejecutar
`database/checks/005_verify_igp_partial_ingestion.sql` en Supabase SQL Editor.

Si se obtiene `ERROR IGP` nuevamente, revisar `ingestion_runs.error_summary`
para conocer la causa específica, sin compartir DATABASE_URL ni contraseñas.

## Alcance y pendientes

No modifica tablas, datasets v1/v2, ni experimentos de Machine Learning.
No se habilita por sí solo ningún trabajo periódico: GitHub Actions quedará
pendiente hasta comprobar la sincronización real. Una ejecución parcial
**no** debe interpretarse como cobertura completa de IGP para alertas.
Conservar el estado `partial` visible y definir una política para la Fase 7.

Validación local de código: 51 pruebas del backend aprobadas con dependencias
instaladas en un entorno aislado. **No se ha probado en la cuenta Supabase del usuario**.
