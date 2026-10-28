# Eventos sísmicos e IGP histórico — Ajuste 02

## Alcance

- Las pestañas **Eventos sísmicos** e **IGP histórico** usan `TablePagination` con 10 filas inicialmente, manteniendo 5/10/20 como tamaños posibles.
- **Eventos sísmicos:** se retira `IGPLivePanel` de la vista (segunda tabla). La tabla única consulta de forma predeterminada los eventos IGP/CENSIS del mes actual de **Perú** (UTC−05:00), calculando correctamente los límites UTC al solicitar la API existente.
- Selector rápido de meses del **año actual en Perú** (2026 durante la implementación). Los meses futuros están visibles pero deshabilitados; el selector aplica los cambios sin abrir el modal. Al aplicar filtros avanzados de magnitud, profundidad o zona sin cambiar fechas se conserva el mes seleccionado; si se introducen fechas, se utiliza ese rango específico UTC.
- Al cambiar de mes se restablecen la página, la fila abierta y los filtros avanzados. «Limpiar» en el modal vuelve al mes seleccionado.
- **Reporte individual:** la tabla y el detalle de Eventos sísmicos construyen una URL individual oficial solamente si el registro dispone de código IGP con patrón `AAAA-NNNN` (incluido el prefijo `IGP/CENSIS/RS`) o de URL individual oficial válida almacenada en `source_url`. No se utiliza la página general como supuesto vínculo individual. Si no puede identificarse una ficha, se indica «Sin ficha individual».
- **IGP histórico 1960–2025:** el catálogo no ofrece códigos de fichas individuales para todas sus filas. Se retiró el enlace general repetido de cada fila y se dejó un vínculo único a la procedencia original debajo de la tabla. Las exportaciones CSV/XLSX/PDF permanecen.

## Verificación

- Ejecutadas 19 pruebas estáticas frontend (`eventos-unificacion-01.test.cjs` y `eventos-unificacion-02.test.cjs`): aprobadas.
- Sintaxis de las dos vistas TSX verificada con el compilador TypeScript (transpilación sin errores sintácticos).
- Pendientes: `npm run build`, pruebas integradas con API en el repositorio completo y comprobación visual de escritorio/móvil.

## Alcance de despliegue

No requiere cambio en FastAPI, migración SQL ni GitHub Actions. Publicar solamente frontend tras compilar y revisar los resultados.
