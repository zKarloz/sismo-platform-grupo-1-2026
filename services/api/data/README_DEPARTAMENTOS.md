# Límites departamentales para el mapa

Archivo generado por `python -m app.commands.prepare_departments --download`:

`services/api/data/peru_departamentos.geojson`

Se trata de geometrías *referenciales* derivadas de la cartografía INEI,
versionadas localmente para que no haya que consultar INGEMMET en cada filtro.
No son delimitaciones legales, áreas de riesgo ni zonas de impacto sísmico.

Fuente reproducible: https://github.com/Rodasluis/Peru-maps
Origen cartográfico: INEI GeoServer Interoperabilidad.
El comando almacena `sha256_original` y la URL de procedencia. Ver
`docs/REVISION_MAPA_04_FALLBACK_POLIGONOS.md`.
