# Calidad y datasets — Revisión 01: separación IGP/CENSIS

**Alcance:** primer paso del plan Calidad → Modelos ML. Cambios aditivos de API y revisión de la interfaz. **No se ejecutan migraciones, capturas reales ni entrenamientos.**

## Datos comprobados

La consulta compartida por el usuario indica dos datasets antiguos `peru_usgs_historico` v1 (35 filas) y v2 (898 filas), ambos 100 % USGS. Esos registros permanecen en Supabase y **no se convierten ni se renombran como IGP**. La consulta del volumen actual de `seismic_events` por fuente aún no se recibió; no se presume un número de eventos IGP utilizables.

## Implementación

- `GET /api/v1/data-quality/summary`: restringido a IGP/CENSIS en SQL; una petición explícita con `source=USGS` recibe HTTP 422.
- `create_dataset`: únicamente crea snapshots IGP; el CLI predetermina `--source IGP/CENSIS` y rechaza otra fuente. Conserva límite de 5000 filas, versión y SHA-256. Un conjunto vacío o que exceda `--max-rows` no crea datasets.
- `GET /api/v1/datasets` y `/{id}/quality`: exponen únicamente snapshots cuya especificación y reporte de calidad demuestran IGP exclusivo. Los históricos USGS no se borran.
- `GET /api/v1/datasets/{id}/preview`: hasta 20 filas congeladas por página, con solo atributos sísmicos.
- `GET /api/v1/datasets/{id}/integrity`: comprobación bajo demanda de tamaño, hash y nombres de fuente en el snapshot.
- React: pestañas Datasets/Calidad/Trazabilidad, filtros en `Modal`, actualizar y exportación CSV. Tabla paginada con componente compartido (5/10/20). El CSV de Datasets contiene **solo la página visible**, claramente indicado en el nombre del archivo; el de Calidad exporta el resumen filtrado.
- No se simula aprobación de datasets ni auditoría de transformaciones, porque todavía faltan persistencia, permisos y esquema acordados.

## Verificación

- 4 pruebas backend IGP nuevas con SQLite aislado.
- 12 pruebas de regresión de Fases 5–6 sin los dos tests históricos de backfill, en montaje aislado.
- 5 pruebas estáticas frontend, y comprobación de sintaxis TSX/TS.
- **Pendiente en equipo local:** `npm run build` y suite completa `pytest tests/backend -q`.

## Comprobación SQL antes de crear el dataset IGP

```sql
SELECT s.name AS fuente, COUNT(*) AS total,
       COUNT(*) FILTER (WHERE e.latitude IS NOT NULL AND e.longitude IS NOT NULL
                       AND e.magnitude IS NOT NULL AND e.depth_km IS NOT NULL) AS completos,
       MIN(e.occurred_at) AS primer_evento,
       MAX(e.occurred_at) AS ultimo_evento
FROM public.seismic_events e
JOIN public.data_sources s ON s.id = e.source_id
GROUP BY s.name ORDER BY s.name;
```

Con un volumen suficiente y un período definido se puede crear un snapshot desde terminal autorizada. Ejemplo (no ejecutado):

```bash
cd services/api
python -m app.commands.create_dataset --name peru_igp_observado --source IGP/CENSIS --min-magnitude 2.5 --max-rows 5000
```

Si hay más de 5000 resultados, el comando falla sin recortar silenciosamente: delimitar fechas/rangos y repetir. Debe ejecutarse solo con `DATABASE_URL` ya configurada en el entorno local autorizado; no introducir ni compartir credenciales por chat.

## Pendiente

1. Inventario IGP real y primera captura controlada.
2. Aprobación explícita de dataset y trazabilidad de transformaciones con migración aditiva y RBAC.
3. Ajustes del laboratorio ML: objetivos, KNN, Random Forest, baselines y validación temporal IGP.
4. Modelos ML: comparaciones, métricas y estimaciones experimentales sin notificaciones automáticas.
