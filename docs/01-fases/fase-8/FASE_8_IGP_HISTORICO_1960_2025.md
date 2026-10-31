# Fase 8 · Catálogo instrumental IGP 1960–2025 (etapa histórica)

**Estado:** preparado y probado con dobles de datos; **pendiente de validar el servicio oficial en vivo y Vercel/Render**.

## Fuente y límites

- Publicador: Instituto Geofísico del Perú, mediante la Plataforma Nacional de Datos Abiertos.
- Recurso oficial: https://www.datosabiertos.gob.pe/dataset/catalogo-sismico/resource/f9629081-0721-4101-a2c2-d0622e046f8b
- Contrato consultado: API DKAN `GET /api/action/datastore/search.json`, recurso UUID `f9629081-0721-4101-a2c2-d0622e046f8b`, con paginación `limit`/`offset`.
- Publicación declarada: 15/06/2026. La cantidad de referencia del recurso era **24.289 registros** cuando se consultó su ficha. El recuento real se obtiene de la API, nunca se codifica como constante.
- Columnas publicadas: `ID`, `FECHA_UTC`, `HORA_UTC`, `LATITUD`, `LONGITUD`, `PROFUNDIDAD`, `MAGNITUD`, `FECHA_CORTE`.
- **`ID` es un ordinal del catálogo**, no el código de evento reportado por CENSIS en 2026. No construir enlaces `/evento/<ID>` para esos registros. El enlace apunta a la ficha oficial del conjunto de datos.
- Catálogo instrumental heterogéneo: la detección mejoró al aumentar las estaciones, especialmente después de 2000. Los recuentos por década no representan aumentos del riesgo sísmico. Puede incluir eventos marinos y limítrofes.

## Arquitectura

`React /historico-igp` → `FastAPI /api/v1/igp-history/events` → caché temporal **en memoria por proceso** (12 horas) → **API oficial DKAN**. Paginación de datos completa desde origen; filtros y paginación final desde el backend. Se valida cada fila (fecha/hora UTC, magnitud, profundidad, coordenadas e ID), se conservan recuentos rechazados y se calcula SHA-256 del contenido normalizado. Ante una caída del proveedor, si existe una copia anterior en el mismo proceso se muestra **`stale: true`**; en ausencia de caché se devuelve 503, no una lista inventada.

No se realizan escrituras en `seismic_events`, `datasets`, `dataset_snapshots`, `ml_experiments` ni se generan alertas históricas. El caché **no es persistente ni compartido entre workers**, y se pierde al reiniciar Render. Es una primera integración sin almacenamiento de históricos en Supabase.

### Exportaciones

`POST /api/v1/igp-history/export` requiere JWT válido; rol `solo_lectura` no puede exportar. CSV, XLSX y PDF reutilizan el generador de Fase 8 con nota de fuente, huella de versión y fecha de corte. Las descargas se auditan mediante `report_exports` y `audit_logs`; el tipo en la tabla es `events` con subtipo `catalog=IGP histórico 1960–2025` registrado en `filters`. No exige migración.

No se recortan resultados silenciosamente: los límites son los existentes de Fase 8 (hasta 400 filas PDF; hasta 5.000 CSV/XLSX, con el máximo configurable). Se debe filtrar por año/zona antes de exportar colecciones grandes.

## Validar primero la fuente oficial (terminal 3)

Desde `services/api`, con `.venv` activado:

```bash
python -m pytest ../../tests/backend -q
python -m app.commands.check_igp_history --year 2024
```

La segunda instrucción **solo consulta; no toca Supabase**. Se espera `status=ok`, `source_rows` coherente con la ficha del recurso, `rows_in_year` y `sample` con fechas válidas. Si aparece `status=error` con "Formato DKAN inesperado" o fallo HTTP, **no desplegar aún**: comprobar la respuesta real y adaptar `app/igp/history_catalog.py` a su esquema; no reemplazar la fuente oficial por datos sintéticos.

Después, en terminal 2:

```bash
cd apps/web
npm run build
npm run dev
```

Abrir `/historico-igp`, consultar 2024, ordenar/paginar, filtrar por magnitud y profundidad, comprobar `source.snapshot_sha256` y exportar un período reducido a CSV, XLSX y PDF como Analista o Administrador. Probar que Solo lectura pueda consultar, pero no exportar.

## Comprobaciones de entrega y limitaciones

- [ ] API DKAN respondió en vivo con todas las páginas y columnas.
- [ ] Conteo y rango por año contrastados con portal oficial.
- [ ] Vista histórica, filtros y paginación funcionando.
- [ ] Exportación auditada e integridad comprobadas en formatos CSV/XLSX/PDF.
- [ ] Vercel y Render desplegados; primera consulta bajo demanda validada (puede ser lenta).
- [ ] No se modificaron los datasets v1/v2 ni los cinco experimentos ML.

**No es una función de alerta temprana, pronóstico ni una copia histórica persistida.** La cache en memoria acelera consultas posteriores, pero no garantiza disponibilidad del servicio externo ante un reinicio del servidor.
