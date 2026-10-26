# Fase 8 · Catálogo IGP 2026 en caché y procedencia por evento

## Objetivo y alcance
- La tabla **Eventos sísmicos** muestra fecha UTC, magnitud, profundidad (km), latitud, longitud, ubicación, proveedor, ID de origen y enlace oficial, con paginación. La hora peruana se puede ver sobre la fecha UTC.
- Cada código IGP/CENSIS de la forma `AAAA-NNNN` se enlaza a la ficha oficial `https://ultimosismo.igp.gob.pe/evento/AAAA-NNNN`. Para códigos sin ficha identificable, usar el portal de reportes, **sin inventar URLs**.
- La vista IGP directa es una consulta al proveedor; la tabla persistida es una caché en Supabase. Las dos vistas tienen significado y frescura distintos.
- El catálogo USGS existente continúa disponible como fuente independiente. No sumar IGP+USGS como si fueran sismos únicos sin conciliación multifuente.

## Carga inicial segura del año 2026

En la terminal privada 3, dentro de `services/api`, con el `.venv` activado y `DATABASE_URL` configurada:

```bash
# Solo consulta y verifica cobertura; no escribe registros.
python -m app.commands.backfill_igp_2026 --dry-run

# Tras revisar los contadores del dry run: carga idempotente del año 2026.
python -m app.commands.backfill_igp_2026 --apply

# Segunda ejecución: no debería crear duplicados.
python -m app.commands.backfill_igp_2026 --apply
```

El proceso pagina la capa oficial `SismosReportados`, filtrando `code LIKE '2026-%'` y ordenando por `objectid ASC`; no asume que las primeras 100/200 filas representan todo el año. Ante páginas repetidas, límite agotado o respuesta inesperada **aborta** para impedir una falsa confirmación de cobertura.

Los registros se insertan/actualizan mediante el UPSERT existente `(source_id, external_id)`, y los errores de normalización quedan contados. El comando `--apply` genera `ingestion_runs`. La capa de reportes puede contener filas de fecha inválida, de modo que una carga puede terminar en `partial` sin perder los registros válidos.

**No se modifican** `datasets`, `dataset_snapshots`, `ml_experiments`; los modelos ya entrenados permanecen reproducibles sobre sus snapshots originales.

## Mantenimiento

`.github/workflows/igp-sync.yml` conserva la ingesta de 100 reportes cada hora. Agrega una ejecución de conciliación **diaria** a las **08:33 UTC**: reconsulta el catálogo IGP del año 2026 para recuperar actualizaciones tardías. La programación de GitHub Actions puede retrasarse o saltarse ejecuciones: no garantiza cobertura o latencia exacta.

Al cambiar de año, se necesita una política de rotación y un comando parametrizado para 2027. Este comando se restringe deliberadamente a 2026 y no elimina registros viejos. La base podría necesitar una revisión de retención si se desea conservar solo el año corriente **del caché IGP**, pero nunca ejecutar borrados contra eventos ya referenciados por snapshots o auditoría.

## Catálogo IGP histórico 1960–2025: siguiente integración

El IGP publica un **CSV versionado** para 1960–2025, diferente de la capa ArcGIS de reportes del año actual. Es recomendable implementarlo como un servicio independiente de consulta bajo demanda con: descarga desde URL oficial verificada, checksum y fecha de publicación; parsers según el diccionario de datos oficial, validación de fechas UTC, paginación por año y filtros; caché con caducidad limitada, y sin insertar ese archivo directamente en `seismic_events`.

Recursos: <https://www.datosabiertos.gob.pe/dataset/cat%C3%A1logo-s%C3%ADsmico-desde-1960-instituto-geof%C3%ADsico-del-per%C3%BA-igp> y <https://ultimosismo.igp.gob.pe/productos/reportes-sismicos>.

**Estado:** backfill anual y tablas implementados en el parche; la lectura histórica directa del CSV 1960–2025 requiere integrar la URL oficial estable y validar el diccionario de campos. No presentar el histórico 1960–2025 como ya disponible bajo demanda dentro de nuestra aplicación.

## Validación

1. Ejecutar `python -m pytest ../../tests/backend -q` y `npm run build`.
2. Abrir `/eventos`, seleccionar `IGP/CENSIS`, revisar campos y enlaces; probar `USGS` y `Todas las fuentes`.
3. Hacer `--dry-run` y comprobar que el servicio responde, que el número total supera la ventana reciente y que `skipped` explica registros incompletos.
4. Hacer `--apply`; revisar Supabase con la consulta de `database/checks/010_verify_igp_2026.sql`.
5. Confirmar que la segunda ejecución no duplica y que GitHub Actions sigue enviando únicamente avisos informativos de eventos nuevos (no alertas retroactivas por backfill).
