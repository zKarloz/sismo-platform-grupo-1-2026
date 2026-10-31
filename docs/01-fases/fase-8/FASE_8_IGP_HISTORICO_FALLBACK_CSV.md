# Fase 8 · Respaldo CSV del catálogo histórico IGP

## Contexto

La API DKAN del portal gubernamental puede dar error HTTP o bloquear conexiones
automatizadas. El adaptador original devolvía 503 sin disponer de una copia local.
Esta ampliación lee primero el archivo oficial CSV (si se ha incorporado al proyecto)
y solo utiliza DKAN cuando no existe un CSV configurado.

## Instalación

1. Descargar manualmente el CSV oficial del recurso:
   https://www.datosabiertos.gob.pe/dataset/catalogo-sismico/resource/f9629081-0721-4101-a2c2-d0622e046f8b
   mediante la opción **Descargar** del portal. No confundir con el diccionario XLSX.
2. Guardarlo como `services/api/data/igp_catalogo_1960_2025.csv`.
3. Verificar encabezados, conteo de filas y huella SHA-256. El portal declara
   **24.289 registros** (la cantidad puede variar si publica una revisión).
4. Desde `services/api`, con `.venv` activado, ejecutar:
   `python -m app.commands.check_igp_history --year 2024`
   El JSON debe indicar `status: ok`, `source_mode: official_csv_snapshot`,
   filas del año y `original_csv_sha256` de 64 caracteres hexadecimales.
5. Ejecutar `python -m pytest ../../tests/backend -q` y `npm run build` desde `apps/web`.
6. Comprobar `/historico-igp` y exportación CSV, XLSX y PDF con un periodo reducido.
7. Para disponibilizarlo en Render, subir también el CSV oficial versionado,
   acompañado por su atribución. Si prefieres una ruta diferente, define
   `IGP_HISTORY_CSV_PATH` en el backend con una ruta absoluta existente.

## Procedencia y límites

- El CSV es una **instantánea del catálogo publicado**, no una consulta en vivo.
  Su consulta local en memoria y la fecha `retrieved_at` indican cuándo lo leyó
  FastAPI, **no cuándo se publicó ni actualizó el archivo en el IGP**.
- La API devuelve `source_mode`, `source_rows`, `invalid_rows`, el SHA-256 de
  la versión normalizada y `original_csv_sha256` del archivo real. La interfaz
  muestra que se trata de una copia local oficial.
- Se mantiene la caché en memoria durante 12 horas por proceso; la sustitución
  del CSV requiere reiniciar FastAPI o esperar al vencimiento del caché.
- Cuando el IGP publique una nueva edición, sustituir el CSV mediante un
  cambio versionado, repetir pruebas y actualizar el documento de procedencia.
- No se modifican `seismic_events`, `datasets`, `dataset_snapshots`,
  `ml_experiments`, ni se generan alertas a partir del histórico.
- La comparación entre décadas requiere cautela: ha cambiado la cobertura
  instrumental de la red sísmica.

## Seguridad

El archivo se lee exclusivamente desde el servidor. No se expone un endpoint
para subir archivos ni una URL externa arbitraria (evita SSRF). Se comprueban
campos obligatorios, tamaños máximos, ID únicos, rango temporal y coherencia.
