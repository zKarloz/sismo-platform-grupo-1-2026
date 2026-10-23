# Automatización gratuita de ingesta IGP — GitHub Actions

## Objetivo y alcance

Ejecutar `python -m app.commands.sync_igp --limit 100` una vez por hora mediante GitHub Actions y almacenar los reportes observados del IGP/CENSIS en Supabase. Este flujo usa las tablas existentes `data_sources`, `ingestion_runs` y `seismic_events`. No modifica los snapshots de ML, datasets ni experimentos. No representa alerta temprana ni garantiza ejecución exacta al minuto.

## Verificación previa (23/10/2026)

- 51 pruebas backend superadas, con una advertencia no bloqueante de Starlette.
- Primera ejecución manual con `--limit 20`: 20 vistos, 18 procesados, 2 omitidos, 18 nuevos; estado `partial`.
- Segunda ejecución: 20 vistos, 18 procesados, 2 omitidos, 0 nuevos y 18 sin cambios. Se verificó la deduplicación.
- Supabase informó 18 registros almacenados para `IGP/CENSIS`.
- Pendiente: confirmar `ingestion_runs.error_summary` de los 2 registros omitidos. Un estado parcial NO garantiza cobertura completa.

## Archivos

- `.github/workflows/igp-sync.yml`: nuevo workflow de ingesta autónoma y manual. **No reemplaza** `.github/workflows/ci.yml`.
- `docs/IGP_AUTOMATIZACION_GITHUB_ACTIONS.md`: estas instrucciones.

## Activación

1. En GitHub, repositorio `zKarloz/sismo-platform-grupo-1-2026` → **Settings → Secrets and variables → Actions → New repository secret**.
2. Crear `DATABASE_URL` con la cadena de Supabase ya validada localmente. Usar Session pooler con SSL. No pegarla en workflow, código, commits ni logs.
3. Copiar los archivos al repositorio local, revisar con `git status`, ejecutar las pruebas actuales y `git add` + `git commit` + `git push origin main`.
4. GitHub → **Actions → Sincronización IGP a Supabase → Run workflow**. Elegir `main` y ejecutar.
5. Abrir logs de `Sincronizar reportes IGP a Supabase`. `OK` significa lote completo según las validaciones del conector; `PARCIAL` significa registros descartados. El workflow muestra una advertencia si hay descartes.
6. Revisar en Supabase que aparezca una ejecución nueva y que no se dupliquen registros:

```sql
-- Últimas ejecuciones IGP y motivo de omisiones
SELECT ir.started_at, ir.status, ir.records_seen,
       ir.records_inserted, ir.records_updated, ir.error_summary
FROM public.ingestion_runs ir
JOIN public.data_sources ds ON ds.id = ir.source_id
WHERE ds.name = 'IGP/CENSIS'
ORDER BY ir.started_at DESC
LIMIT 5;

-- Total almacenado en IGP/CENSIS
SELECT COUNT(*) AS eventos_igp_almacenados
FROM public.seismic_events se
JOIN public.data_sources ds ON ds.id = se.source_id
WHERE ds.name = 'IGP/CENSIS';
```

## Frecuencia y costos

- El cron `17 * * * *` solicita **una ejecución cada hora** (minuto 17 UTC). GitHub puede retrasar u omitir trabajos programados en periodos de alta carga; un repositorio público inactivo por 60 días puede ver el cron deshabilitado.
- Los trabajos estándar en repositorios públicos son gratuitos; para repositorios privados aplican cuotas de minutos según el plan. Monitorizar **Settings → Billing**.
- Si el trabajo funciona y la cuota lo permite, puede modificarse a cada 30 minutos usando `17,47 * * * *`, pero esta primera versión queda en una hora.

## Riesgos y criterios pendientes de Fase 7

- No hay garantía de actualización inmediata ni de cobertura exhaustiva del catálogo IGP: los reportes incompletos quedan omitidos.
- GitHub Actions no es infraestructura de alerta de emergencia. Antes de la Fase 7 habrá que definir cuándo un reporte parcial bloquea la generación de avisos, y cómo registrar reintentos y auditoría.
- Las estadísticas nacionales consolidadas requieren revisar coincidencias IGP/USGS para evitar el doble conteo, sin modificar los eventos originales.
- Si `--limit 100` es insuficiente por interrupciones prolongadas, implementar recuperación por fecha/paginación, no asumir que la última ventana contiene todos los eventos.
