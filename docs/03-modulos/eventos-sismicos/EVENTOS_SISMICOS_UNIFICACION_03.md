# Eventos sísmicos — Revisión 03: tabla, detalle y mapa

## Objetivo
Mejorar la lectura de las fechas, evitar datos repetidos en el detalle y conectar cada evento del catálogo operativo con el Mapa sísmico existente.

## Cambios
- «Fecha UTC» se presenta como `DD/MM/AAAA, HH:MM:SS UTC`, sin texto ISO con `T` y `Z`.
- Se añade **Ver en el mapa** por registro, mediante `/mapa-sismico?igp_event=<id>` y `location.state.igpReport`, contrato que ya interpreta el módulo de mapa. El reporte real y sus coordenadas viajan con la navegación para encontrar el epicentro incluso si está fuera del mes mostrado en el mapa; no se inventan epicentros. No se modifica el módulo Mapa sísmico.
- El detalle deja de incrustar OpenStreetMap y de repetir fecha UTC, profundidad, tipo de magnitud, ubicación, enlace IGP y procedencia visible en la tabla.
- Se conservan los datos internos adicionales: UUID, fuente, coordenadas, **Ocurrencia (Perú)**, **Recepción en el sistema (Perú)** y estado de revisión. `unreviewed` se muestra como «Sin revisión registrada» y se explica que no equivale a una afirmación sobre la revisión del IGP.
- `source_updated_at` se muestra como **Actualización de la fuente (Perú)** únicamente cuando existe; cuando es nulo se omite. El esquema actual no ofrece hash de origen, por lo que tampoco se muestra un campo vacío que sugiera que se recibió ese dato.
- En el selector rápido se mantienen bloqueados los meses futuros, pero las opciones se llaman sencillamente Noviembre y Diciembre, sin la palabra «Próximamente».
- Se conservan tabla única, filtros avanzados, 10 filas iniciales y `TablePagination` dentro del mismo panel. IGP histórico no cambia.

## Verificación
`node --test tests/frontend/eventos-unificacion-01.test.cjs tests/frontend/eventos-unificacion-02.test.cjs tests/frontend/eventos-unificacion-03-detalle-mapa.test.cjs` — 28 pruebas estáticas aprobadas en la revisión.

La sintaxis TSX fue verificada mediante la transpilación de TypeScript. Pendientes en el proyecto real: `npm run build` y comprobación del foco del epicentro en el navegador, en particular al seleccionar un evento de un mes anterior.

## Despliegue
Solo frontend. No requiere migración de Supabase, modificación de FastAPI ni cambio de GitHub Actions. Publicar Vercel después de probar. El mapa utiliza la interfaz de navegación `igp_event` y `igpReport` ya existente.
