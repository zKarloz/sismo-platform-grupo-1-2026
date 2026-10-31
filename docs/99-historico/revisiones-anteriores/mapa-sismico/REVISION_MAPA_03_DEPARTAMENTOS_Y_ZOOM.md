# Revisión Mapa 03 — Departamento y zoom por rueda

## Qué hace la leyenda (diferente de la agrupación)

- **Epicentro individual:** círculo turquesa cuyo **radio en píxeles** corresponde al rango de magnitud observado: M<3: 5 px, M3–3.9: 7 px, M4–4.9: 9 px, M5–5.9: 11 px, M≥6: 13 px. La leyenda explica estos tamaños. No es una representación física del área afectada ni del peligro sísmico.
- **Grupo de epicentros:** círculo oscuro con un **número** que cuenta marcadores próximos en la pantalla para el zoom actual; su tamaño no representa magnitud. Al ampliar el mapa, los grupos se separan.

## Mejoras de esta revisión

1. El filtro del **Mapa sísmico** añade «Departamento del Perú» (25 opciones). Lee, mediante el backend, un polígono referencial publicado por el servicio ArcGIS de INGEMMET (`NM_DEPA`). No usa rectángulos como reemplazo silencioso de límites territoriales.
2. FastAPI consulta el servicio geográfico con una lista blanca de departamentos; mantiene las geometrías en caché por proceso y devuelve 503 cuando el proveedor está inaccesible. No requiere clave API, SQL ni migraciones.
3. React consulta IGP/CENSIS en Supabase utilizando la caja delimitadora del polígono como pre-filtro eficiente, pero **comprueba el polígono real** antes de dibujar los epicentros. Se soportan polígonos múltiples e islas. Los recuentos mostrados dentro de la vista departamental corresponden a los epicentros dibujados, no al total de la caja.
4. Para evitar cifras incorrectas, este filtro administrativo es **solo del módulo Mapa**: no se propaga como un filtro exacto a los KPI de Dashboard ni se permite exportar desde el botón CSV mientras se usa. Los filtros por fechas, magnitud, profundidad y el modo avanzado se mantienen compartidos. La exportación precisa departamental queda para una extensión futura del backend.
5. La rueda del mouse **sobre el mapa** controla zoom (`scrollWheelZoom`). Fuera del mapa, la rueda desplaza la página. La capa de Leaflet sigue aislada por CSS, bajo el sidebar móvil y el modal.

### Limitaciones explícitas

- Los límites territoriales son referenciales. Un epicentro **en el océano frente a un departamento** no cae dentro de su polígono terrestre; selecciona rectángulo o centro-radio si quieres incluir el mar adyacente.
- El catálogo sincronizado se consulta con un límite de 1.000 puntos. Si la caja del departamento tiene más eventos, se indica el truncamiento y se debe reducir el período.
- La cartografía necesita conexión de Render al proveedor INGEMMET al menos en la primera consulta por departamento después de un reinicio. Si falla, se muestra error; no se fabrican geometrías.
- Fuente de límites: https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CARTOGRAFIA_DEMARCACION_WGS84/MapServer/0
- Fuente sísmica: IGP/CENSIS. Sin predicciones ni estimaciones de impacto.

## Demostración para el profesor

1. Abre Mapa sísmico y conserva el mes actual de Perú. Aleja el zoom para que aparezcan **círculos numerados** (agrupación); acerca el zoom para separarlos.
2. Selecciona un epicentro individual y compara su tamaño con la **leyenda por magnitud**. Abre detalles para ver magnitud, profundidad, fecha y fuente.
3. Abre Filtros → Zona geográfica → **Departamento del Perú** → «Lima» → Aplicar. Comprueba que el mapa muestre el contorno referencial y únicamente epicentros interiores. Repite con «Arequipa», «Cusco» o «Ica». Si hay pocos eventos en el mes actual, amplía la fecha a varios meses de 2026, sin inventar recuentos.
4. Abre Filtros → Centro y radio para buscar también epicentros frente a la costa. Ejemplo de zona de consulta: (-12.04, -77.03), radio 100 km. El círculo dibujado es de **búsqueda**, no de impacto.
5. Coloca el cursor sobre el mapa y usa la rueda; después mueve el cursor al lateral y usa la rueda para desplazar el módulo. Comprueba que el modal y el sidebar móvil permanecen por encima del mapa.

## Validación local previa al despliegue

- Terminal 1: iniciar/reiniciar FastAPI.
- Terminal 2: `cd apps/web && npm run build && npm run dev`.
- Terminal 3: `cd services/api && python -m pytest ../../tests/backend -q`; desde la raíz `node --test tests/frontend/mapa-departamentos.test.cjs`.
- Probar manualmente el filtro departamental con Render y Vercel porque en el entorno de creación no se verificó una respuesta **en vivo** del proveedor INGEMMET.

No se modifican los modelos ML, la base de datos ni los eventos USGS almacenados.
