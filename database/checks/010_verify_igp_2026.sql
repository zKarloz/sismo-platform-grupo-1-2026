-- Verificar el caché anual IGP, sin alterar datasets ni experimentos.
WITH igp AS (
  SELECT e.* FROM public.seismic_events e
  JOIN public.data_sources s ON s.id = e.source_id
  WHERE s.name = 'IGP/CENSIS' AND e.external_id LIKE '2026-%'
)
SELECT COUNT(*) AS eventos_igp_2026,
       MIN(occurred_at) AT TIME ZONE 'America/Lima' AS primer_evento_peru,
       MAX(occurred_at) AT TIME ZONE 'America/Lima' AS ultimo_evento_peru,
       COUNT(DISTINCT external_id) AS codigos_unicos,
       COUNT(*) FILTER (WHERE source_url LIKE 'https://ultimosismo.igp.gob.pe/evento/2026-%') AS enlaces_individuales
FROM igp;

-- Los experimentos y datasets anteriores no deben alterarse.
SELECT 'datasets' AS entidad, COUNT(*) AS total FROM public.datasets
UNION ALL SELECT 'dataset_snapshots', COUNT(*) FROM public.dataset_snapshots
UNION ALL SELECT 'ml_experiments', COUNT(*) FROM public.ml_experiments;

-- Últimos trabajos IGP, incluidos los de la carga anual.
SELECT ir.started_at, ir.status, ir.records_seen, ir.records_inserted,
       ir.records_updated, ir.error_summary
FROM public.ingestion_runs ir
JOIN public.data_sources s ON s.id = ir.source_id
WHERE s.name = 'IGP/CENSIS'
ORDER BY ir.started_at DESC LIMIT 10;
