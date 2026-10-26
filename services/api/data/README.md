# Catálogos históricos IGP/CENSIS

## Fuente preferida: XLSX CENSIS

Ubica aquí el archivo oficial exportado desde
https://ultimosismo.igp.gob.pe/repositorio/datos-sismicos y nómbralo:

`igp_catalogo_1960_2025.xlsx`

En el proyecto se utiliza el rango 1960-01-01 a 2025-12-31, latitudes
-20.345 a 0.718, longitudes -88.096 a -66.591, magnitudes 1.0–9.0 y
profundidades 0–900 km, según los parámetros usados al descargar.
El rango es rectangular; NO constituye las fronteras del Perú.

El XLSX suministrado por el grupo contiene 25 056 sismos, incluyendo 556
registros de 2024. La versión que se incluya en Git debe preservar sus
metadatos, condiciones de reutilización y atribución al IGP.

FastAPI no usa Excel para consultas: lee el snapshot una vez, normaliza
las filas en memoria, calcula SHA-256 y mantiene caché temporal (12 h).
No añade eventos a Supabase ni afecta datasets, experimentos o alertas.

## Respaldo secundario: CSV de Datos Abiertos

Si falta el XLSX, el adaptador lee `igp_catalogo_1960_2025.csv`, si existe.
Su catálogo y cobertura NO son idénticos al XLSX (el CSV probado no tiene
registros de 2024). No mezclar ambos sin distinguir versiones.

Como última opción, consulta DKAN (puede estar inaccesible).

Variables opcionales (solo backend): `IGP_HISTORY_XLSX_PATH` y
`IGP_HISTORY_CSV_PATH` para rutas absolutas. No son URLs públicas.
