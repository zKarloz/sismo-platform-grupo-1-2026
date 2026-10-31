# Integración IGP persistente — preparación para Fase 7

## Objetivo

Sincronizar reportes **observados y publicados** del IGP/CENSIS desde ArcGIS REST hacia PostgreSQL de Supabase. Mantener USGS como fuente separada. No se ofrecen predicciones, alertas tempranas ni avisos oficiales.

## Archivos

- `services/api/app/ingestion/igp.py`: sincronizador transaccional; creación de fuente, `ingestion_runs`, deduplicación y detección de correcciones.
- `services/api/app/commands/sync_igp.py`: CLI privado para Render Cron. No hay endpoint HTTP para ejecutar escrituras.
- `services/api/app/igp/client.py`: ampliación de la consulta hasta 500 registros; el modo estricto **solo** se activa en ingesta, de manera que los cambios del contrato IGP se registren como fallos, no como una sincronización «exitosa» con pérdidas silenciosas.
- `tests/backend/test_igp_ingestion.py`: pruebas sin acceso a Internet ni a Supabase de producción.
- `database/checks/004_verify_igp_ingestion.sql`: comprobaciones de lectura en Supabase.

## Pasos locales (Git Bash)

Desde raíz del monorepo:

```bash
cd services/api
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
python -m app.commands.sync_igp --limit 500
python -m app.commands.sync_igp --limit 500
```

La primera ejecución importa los reportes recientes disponibles (hasta 500). La segunda no debe insertar duplicados ni actualizar filas sin cambios. Si se publica o corrige un evento entre ambas ejecuciones, habrá altas o revisiones legítimas.

Comprobar `http://127.0.0.1:8000/api/v1/sources` y `http://127.0.0.1:8000/api/v1/events?source=IGP%2FCENSIS`. No hace falta iniciar Uvicorn para ejecutar el comando; sí para ver los endpoints.

En Supabase, ejecutar el SQL de verificación. Verificar también que `peru_usgs_historico` v1/v2 y los cinco experimentos se conservan.

## Automatización Render

Crear un servicio **New → Cron Job**, NO un segundo Web Service ni una tarea dentro de `uvicorn`:

| Campo | Valor |
| --- | --- |
| Name | `sismo-platform-igp-sync` |
| Repository | `zKarloz/sismo-platform-grupo-1-2026` |
| Branch | `main` |
| Language | `Python 3` |
| Root Directory | `services/api` |
| Build Command | `pip install -r requirements.txt` |
| Schedule (UTC) | `*/5 * * * *` |
| Command | `python -m app.commands.sync_igp --limit 200` |
| Environment | `DATABASE_URL` = Session pooler de Supabase (`postgresql+psycopg://...?...sslmode=require`), `PYTHON_VERSION` = misma versión del Web Service |

Cron de Render tiene **cargo mínimo de US$1 mensual**, sujeto a facturación. Revisar la tarifa vigente antes de crearlo. Poner la URL de Supabase exclusivamente en Render → Environment, nunca en Git o Vercel. Configurar permisos mínimos en el rol PostgreSQL cuando se implemente la seguridad completa. Los trabajos Cron se programan en **UTC**.

Verificar en Render → Cron Job → Runs → Trigger Run; comparar `ingestion_runs` y fechas en `/api/v1/sources`. Después comprobar dos ejecuciones automáticas separadas por unos minutos. `last_sync_at` significa **consulta al servicio**, no aparición de un sismo nuevo.

No ejecutar al mismo tiempo otro mecanismo de programación sin necesidad. La consulta IGP sigue estando disponible para la web abierta mediante la API existente, independientemente del cron.

## Seguridad e integridad

- Fuente `IGP/CENSIS` independiente del proveedor `USGS`; no se cruzan sus `external_id`.
- El código oficial `AAAA-NNNN` se usa como identificador estable; `OBJECTID` de ArcGIS se rechaza para persistencia.
- El `upsert` tiene restricción `(source_id, external_id)`; actualiza solo cuando cambia algún atributo sísmico.
- Mantiene la misma `id` interna ante correcciones, y guarda cada ejecución como `success` o `failed`.
- Si IGP devuelve cero registros o uno malformado, se informa error de la ejecución; no se inventan valores. Si la BD está completamente inaccesible, puede ser imposible registrar el fallo allí, pero Render conserva el resultado fallido.
- El comando **no usa** ni modifica las tablas `datasets`, `dataset_snapshots` y `ml_experiments`.
- El frontend inicia sus filtros históricos en `USGS` para no sumar eventos de dos proveedores como eventos distintos. Se puede elegir IGP explícitamente; «Todas» representa registros por fuente, no sismos físicos únicos.
- La ingesta automatizada solo consulta los últimos 200 reportes (500 en arranque manual); no equivale a capturar el catálogo histórico completo del IGP. Si la fuente sufre una caída prolongada, ejecutar recuperación supervisada.
- Revisar las condiciones vigentes de reutilización/atribución de IGP antes de un uso público de los datos persistidos.

## Validación y criterio de cierre

- [ ] `python -m pytest ../../tests/backend -q` sin fallos.
- [ ] Primera ingesta real a Supabase con `Vistos / Nuevos / Actualizados / Sin cambios`.
- [ ] Segunda ingesta sin duplicados.
- [ ] Fuente `IGP/CENSIS` con `last_run.status = success`.
- [ ] Consultas SQL correctas, sin alteración de datasets y experimentos previos.
- [ ] Render Cron ejecutado manualmente y luego automáticamente.
- [ ] Dashboard/mapa muestran IGP en la sección en vivo; el catálogo almacenado se puede filtrar por fuente.

**Pendiente Fase 7:** reglas internas de eventos ya ocurridos, estados de revisión/aprobación, idempotencia, registro de auditoría y control de permisos antes de habilitar envíos.
