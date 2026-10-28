-- Ampliación ADITIVA de ML para cuatro objetivos instrumentales IGP.
-- Ejecutar después de 003_ml_experiments.sql. No elimina filas ni USGS históricos.
BEGIN;

-- CHECK generado automáticamente por PostgreSQL para target_name en 003.
ALTER TABLE public.ml_experiments
    DROP CONSTRAINT IF EXISTS ml_experiments_target_name_check;
ALTER TABLE public.ml_experiments
    DROP CONSTRAINT IF EXISTS ml_experiments_task_target;

ALTER TABLE public.ml_experiments
    ADD CONSTRAINT ml_experiments_target_name_check CHECK (
        target_name IN ('magnitude_observed', 'depth_observed',
                        'depth_class_observed', 'magnitude_range_observed')
    );
ALTER TABLE public.ml_experiments
    ADD CONSTRAINT ml_experiments_task_target CHECK (
        (task_type = 'regression' AND target_name IN ('magnitude_observed', 'depth_observed')) OR
        (task_type = 'classification' AND target_name IN ('depth_class_observed', 'magnitude_range_observed'))
    );
COMMIT;
