-- Verificación de ingesta programada IGP/CENSIS (solo SELECT).
-- Ejecutar tras la primera sincronización desde Supabase > SQL Editor.

-- A) Fuente IGP, estado y último éxito (una fila esperada).
SELECT name, status, sync_interval_minutes, last_sync_at, last_success_at
FROM public.data_sources
WHERE name = 'IGP/CENSIS';

-- B) Registros por proveedor: USGS e IGP se mantienen separados.
SELECT ds.name AS fuente, COUNT(e.id) AS registros, MAX(e.occurred_at) AS evento_mas_reciente_utc
FROM public.data_sources AS ds
LEFT JOIN public.seismic_events AS e ON e.source_id = ds.id
GROUP BY ds.id, ds.name ORDER BY ds.name;

-- C) Últimas ejecuciones IGP (success o failed si hubo incidencias).
SELECT ir.started_at, ir.finished_at, ir.status,
       ir.records_seen, ir.records_inserted, ir.records_updated, ir.error_summary
FROM public.ingestion_runs ir
JOIN public.data_sources ds ON ds.id = ir.source_id
WHERE ds.name = 'IGP/CENSIS'
ORDER BY ir.started_at DESC LIMIT 10;

-- D) No debe haber registros repetidos dentro de la misma fuente (cero filas).
SELECT source_id, external_id, COUNT(*) AS repeticiones
FROM public.seismic_events
GROUP BY source_id, external_id
HAVING COUNT(*) > 1;

-- E) Prueba de conservación: inspeccionar los datasets y experimentos anteriores.
-- No son modificados por el comando sync_igp.
SELECT name, version, row_count, content_sha256 FROM public.datasets
WHERE name = 'peru_usgs_historico' ORDER BY version;
SELECT dataset_id, COUNT(*) AS experimentos FROM public.ml_experiments
GROUP BY dataset_id ORDER BY experimentos DESC;
