# Revisión de Fuentes de datos 01 — IGP/CENSIS

## Alcance

- Fuente visible exclusiva: IGP/CENSIS. USGS continúa almacenado internamente y no se elimina.
- Historial real de `ingestion_runs` en FastAPI mediante `GET /api/v1/sources/igp/runs` (requiere sesión Supabase; 5/10/20 por página, filtro por resultado).
- El listado público de fuentes devuelve solo IGP, sin exponer texto de errores operativos.
- Estado configurado del conector y resultado de la última ejecución se muestran separados. Duración calculada desde `started_at`/`finished_at`; filtros y carga usan componentes compartidos.
- Documentación del conector, límites conocidos de la **tarea** y referencias a secretos, nunca sus valores. Tema oscuro original conservado.

## Automatización verificada en `.github/workflows/igp-sync.yml`

- `17 * * * *`: solicitud de ingesta reciente cada hora, **UTC**.
- `33 8 * * *`: conciliación diaria de 2026, **UTC** (además de la ingesta ordinaria).
- `workflow_dispatch`: posibilidad de ejecución manual desde GitHub, regida por sus permisos.
- `concurrency: igp-sync-supabase` con `cancel-in-progress: false` previene solapamiento de jobs de ese workflow. No coordina con posibles procesos externos.
- GitHub puede retrasar ejecuciones programadas. La fuente almacena `sync_interval_minutes=5` desde ingestas antiguas; **no** utilizar esa cifra para describir el cron vigente. No se cambió la base ni el workflow.

## Alcance pendiente

- Acción manual desde la web: todavía no existe. Actualmente puede abrirse el workflow en GitHub con permisos propios del repositorio. Una futura API de despacho deberá usar credenciales exclusivamente en el servidor, RBAC, auditoría, limitación de frecuencia y prevenir dobles trabajos.
- Contacto, licencia definitiva y límites oficiales de IGP: requieren comprobación formal y eventualmente nuevos metadatos; no se inventan valores.
- En `ingestion_runs` no existe columna con el número exacto de omitidos; la advertencia histórica se muestra en `error_summary` para usuarios autenticados.
- No se comprobó la base de datos real de Supabase ni la ejecución del cron desde esta revisión.

## Validación local

```bash
# Terminal 2, apps/web
npm run build

# Terminal 3, raíz
PYTHONPATH=services/api python -m pytest tests/backend/test_sources_igp_history.py tests/backend/test_igp_ingestion.py tests/backend/test_igp_partial.py -q
node --test tests/frontend/fuentes-igp-ui.test.cjs
```

**Migraciones:** ninguna. **Despliegue:** actualizar primero FastAPI (Render), después React (Vercel).
