-- Verifica el dataset histórico IGP recién creado.
-- Consulta de solo lectura.

SELECT
    d.name,
    d.version,
    d.row_count AS filas_declaradas,
    COUNT(s.position) AS filas_guardadas,
    COUNT(*) FILTER (
        WHERE s.split = 'train'
    ) AS entrenamiento,
    COUNT(*) FILTER (
        WHERE s.split = 'validation'
    ) AS validacion,
    d.content_sha256
FROM public.datasets d
JOIN public.igp_historical_dataset_snapshots s
    ON s.dataset_id = d.id
WHERE d.id = '3e00e137-22dd-470e-ae22-3b348f058c4f'
GROUP BY
    d.id,
    d.name,
    d.version,
    d.row_count,
    d.content_sha256;
