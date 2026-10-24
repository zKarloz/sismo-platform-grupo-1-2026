-- Solo lectura: comprobar resultado real de la ingesta IGP en Supabase.
-- Si hubo descartes de calidad, la ejecución debe indicar status='partial'.
SELECT
    ir.started_at AT TIME ZONE 'America/Lima' AS inicio_peru,
    ds.name AS fuente,
    ir.status,
    ir.records_seen,
    ir.records_inserted,
    ir.records_updated,
    ir.error_summary
FROM public.ingestion_runs AS ir
JOIN public.data_sources AS ds ON ds.id = ir.source_id
WHERE ds.name = 'IGP/CENSIS'
ORDER BY ir.started_at DESC
LIMIT 5;

-- Ejecutar por separado si el editor muestra solo el último SELECT:
SELECT ds.name AS fuente, COUNT(se.id) AS eventos_igp_almacenados
FROM public.data_sources AS ds
LEFT JOIN public.seismic_events AS se ON se.source_id = ds.id
WHERE ds.name = 'IGP/CENSIS'
GROUP BY ds.name;
