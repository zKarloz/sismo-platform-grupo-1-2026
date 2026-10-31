# Unificación de Eventos sísmicos e IGP histórico — Revisión 01

## Alcance

- Una única entrada **Eventos sísmicos** en sidebar, con pestañas subrayadas **Eventos sísmicos** (`/eventos`) e **IGP histórico** (`/eventos/historico`). La antigua ruta `/historico-igp` redirige sin romper enlaces.
- Ambas pestañas utilizan `Modal.tsx` para filtrar y `TablePagination` (5 iniciales; 5/10/20), dentro del mismo contenedor que la tabla.
- **Eventos registrados:** conserva el panel de consulta directa IGP y lista únicamente registros IGP/CENSIS de Supabase. FastAPI amplía `/api/v1/events` con profundidad mínima/máxima y zona WGS84. Un detalle desplegable con flecha giratoria muestra campos de procedencia y un mapa OpenStreetMap; no se inventa el hash no almacenado.
- **IGP histórico:** título **Catálogo histórico IGP 1960–2025**. Selector y botón **Consultar año** fuera del modal; fechas específicas, magnitud, profundidad y zona dentro del modal. El histórico se consulta solo tras una acción del usuario; conserva los filtros UTC inclusivos y las exportaciones CSV, XLSX y PDF con límites por cantidad.
- La consulta histórica sigue independiente del catálogo operativo, de las alertas y de los modelos; no se mezclan sus conteos.

## Seguridad y compatibilidad

- No se agregan tablas ni migraciones. No cambia la ingesta, la sincronización ni los correos.
- Los filtros geográficos deben especificar cuatro coordenadas válidas y ordenadas. El backend devuelve HTTP 422 para rangos de profundidad o zona inválidos.
- `readHistory` conserva su firma antigua con `AbortSignal` y admite tamaño de página nuevo.
- `seismic_events` no tiene columnas separadas de región/localidad ni hash de origen; se presenta `place` tal como viene, y el hash se indica como no disponible. No atribuir propiedades que no estén almacenadas.
- El mapa externo se carga bajo demanda al abrir un detalle; presenta coordenadas, no intensidad ni riesgo sísmico.

## Verificaciones ejecutadas

- 9 pruebas estáticas del frontend (`node --test tests/frontend/eventos-unificacion-01.test.cjs`).
- 5 pruebas funcionales de filtros FastAPI con SQLite aislado (`tests/backend/test_eventos_unificados.py`).
- Sintaxis de los siete archivos TypeScript/TSX modificados comprobada con el parser de TypeScript.
- **Pendiente en repositorio completo:** `npm run build`, pruebas backend totales y revisión visual en móvil y escritorio.

## Publicación

1. Aplicar el parche sobre la versión actual del proyecto; revisar diferencias antes de confirmar Git.
2. Ejecutar pruebas y `npm run build`.
3. Desplegar primero la API FastAPI en Render (nuevos filtros) y después la web en Vercel.
4. Revisar `/eventos`, `/eventos/historico`, redirección antigua, exportaciones y paginación.
