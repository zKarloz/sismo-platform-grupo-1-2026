# Calidad y datasets — Revisión 03: aprobación de versiones IGP

## Objetivo
Registrar decisiones **humanas y verificables** sobre la calidad de cada versión del dataset histórico IGP, sin alterar sus snapshots ni los experimentos ML.

## Cambios
- Migración aditiva `CALIDAD_DATASETS_IGP_03_REVISION.sql`: tabla `dataset_reviews` (una decisión inmutable por dataset), FK a usuario, fecha, comentario y SHA-256. Trigger contra UPDATE/DELETE y RLS sin acceso directo de navegador.
- `POST /api/v1/datasets/{id}/review`: exige sesión Supabase válida y rol **administrador o analista**; la identidad del revisor se obtiene de la base, no del cuerpo. La aprobación vuelve a calcular el SHA-256 de **todas** las filas, comprueba la fuente, el período 2019–2024, las particiones, duplicados, rangos y campos esenciales. El rechazo registra la justificación sin exigir integridad positiva. Una segunda decisión sobre la misma versión devuelve 409.
- Transacción única: decisión + registro en `audit_logs` (`dataset.review.approved` / `dataset.review.rejected`). No se actualiza `datasets`, `igp_historical_dataset_snapshots` ni ML.
- `GET /api/v1/datasets`: retorna la decisión (pendiente/aprobado/rechazado), fecha y revisor. La interfaz muestra el estado en Datasets y una sección de revisión con modal en Trazabilidad.
- Los campos opcionales **localidad, tipo de magnitud y actualización de origen** faltan en el Excel oficial y no impiden aprobar cuando la integridad y los cinco campos esenciales son correctos. La ausencia de escala identificada sigue como limitación técnica.

## Instalación
1. Instalar el ZIP en la raíz del repositorio.
2. Ejecutar en Supabase SQL Editor `database/migrations/CALIDAD_DATASETS_IGP_03_REVISION.sql` después de migraciones 002, histórica IGP y 005 de identidad.
3. Desplegar/reiniciar FastAPI para habilitar POST, y reconstruir React.
4. Abrir **Calidad y datasets → Datasets → Trazabilidad** con usuario administrador/analista; verificar integridad, decidir y escribir un comentario de 15–1000 caracteres.

## Pruebas
```bash
PYTHONPATH=services/api python -m pytest tests/backend/test_calidad_revision_03.py tests/backend/test_calidad_igp_revision_01.py tests/backend/test_igp_historical_dataset_01.py -q
node --test tests/frontend/calidad-datasets-revision-03.test.cjs tests/frontend/calidad-datasets-igp-01.test.cjs tests/frontend/calidad-dataset-historico-02.test.cjs
cd apps/web && npm run build
```

## Precauciones
- La aprobación es **posterior** a los entrenamientos IGP ya guardados; no acredita que estos fueron ejecutados con un dataset previamente aprobado.
- Este parche **no bloquea automáticamente futuros entrenamientos** por estado pendiente/rechazado. Esa política debe incorporarse al comando de entrenamiento antes de utilizar aprobación como prerrequisito obligatorio.
- Una decisión definitiva no se edita. Si existe un error, se crea una nueva versión del dataset y se documenta.
- 2025 sigue reservado: no se consulta como dataset de desarrollo, no se reentrena ni se publica ninguna alerta.
