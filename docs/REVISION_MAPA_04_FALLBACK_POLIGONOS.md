# Revisión Mapa 04 — Recuperación de filtros departamentales (HTTP 503)

## Diagnóstico

El endpoint FastAPI `/api/v1/events/departments/{code}/boundary` usaba una
petición síncrona a ArcGIS de INGEMMET por primera selección. Un fallo de red
impedía aplicar *cualquier* filtro departamental; los unit tests empleaban
respuestas falsas y no comprobaban disponibilidad externa.

## Corrección

1. El backend utiliza primero `services/api/data/peru_departamentos.geojson`.
   El comando de preparación obtiene y valida 25 geometrías reales de un
   conjunto derivado de cartografía INEI. **No se incluye geometría ficticia.**
2. Se exige cobertura de los 25 departamentos, nombres no duplicados,
   geometrías Polygon/MultiPolygon y coordenadas dentro de Perú.
3. Las respuestas incluyen `source_mode=snapshot_local_referencial` y SHA-256.
4. Si falta el archivo, se conserva la consulta a INGEMMET y su error 503;
   si existe un archivo dañado, se avisa y no se usa una caja rectangular falsa.
5. Los textos del Mapa dejan de atribuir siempre las geometrías a INGEMMET.
   El filtrado por polígono se realiza en React como antes; backend reduce
   previamente candidatos a la caja del límite.

## Instalación, una sola vez

Desde `services/api`, con el entorno virtual activado:

```bash
python -m app.commands.prepare_departments --download
python -m app.commands.prepare_departments --check
```

Si GitHub no se puede consultar automáticamente, descargar en el navegador
`departamento_simplificado.geojson` desde
https://github.com/Rodasluis/Peru-maps/blob/main/salida/departamento_simplificado.geojson
(utilizar **Download raw file**) y ejecutar:

```bash
python -m app.commands.prepare_departments --file "C:/Users/USUARIO/Downloads/departamento_simplificado.geojson"
python -m app.commands.prepare_departments --check
```

Solo cuando indique `status=ok` y `departments=25`, reiniciar FastAPI.
**Antes de publicar Render:** versionar también el archivo preparado
`services/api/data/peru_departamentos.geojson` en Git tras revisar atribución y
condiciones de redistribución. Render no conserva de forma fiable archivos
creados en su almacenamiento efímero después de un despliegue.

## Comprobación rápida

- GET `/api/v1/events/departments/AREQUIPA/boundary`: debe devolver 200
  y `source_mode=snapshot_local_referencial`.
- Cambiar Lima, Arequipa, Huánuco y Cusco sin errores 503.
- La vista debe mostrar únicamente epicentros **terrestres** dentro del polígono.
- Comprobar que la selección por radio y el zoom siguen funcionando.

```bash
python -m pytest ../../tests/backend -q
```

### Procedencia y límites

Publicación de las 25 geometrías simplificadas de departamentos: Luis Rodas,
*Peru-maps* (https://github.com/Rodasluis/Peru-maps), derivada de capas WFS
cartográficas del INEI; simplificación de 100 m para uso web.
Las geometrías no equivalen a deslindes oficiales ni zonas de afectación.
El repositorio incluye un pipeline de validación y atribución; para citar
versiones académicas, usar la versión archivada indicada por el autor.

Este parche no modifica datos sísmicos, alertas, experimentos ML ni SQL.
