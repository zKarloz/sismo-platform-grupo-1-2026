# Integración de IGP en dashboard y mapa — Informe breve

## Alcance

- El **dashboard** muestra primero el último evento de la capa oficial `Último Sismo` y una muestra de hasta cinco reportes de `Sismos Reportados`. Las marcas temporales se presentan en `America/Lima`.
- El **mapa** utiliza por defecto hasta **20 reportes recientes** de `GET /api/v1/igp/recent` y ofrece un selector explícito para explorar el catálogo histórico sincronizado de Supabase/USGS.
- El historial USGS conserva sus métricas, filtros y gráficos separados, por lo que **no se suman los registros IGP y USGS** (podrían referirse al mismo sismo).
- La consulta IGP desde React se realiza **siempre a través de FastAPI**; se repite cada cinco minutos **solo mientras la vista esté abierta**. FastAPI mantiene caché de 120 s. La frecuencia de consulta no garantiza publicación instantánea.
- Se reutilizan los tokens de color del tema claro/oscuro. No hay migración SQL, cambio de dataset ML ni modificación de la ingesta USGS.

## Archivos

- `apps/web/src/types/igp.ts`: contrato de las capas IGP.
- `apps/web/src/services/igp.ts`: cliente HTTP, fecha peruana y advertencias de frescura.
- `apps/web/src/hooks/useIGPFeed.ts`: actualización por intervalo, cancelación y estados de error.
- `apps/web/src/modules/dashboard/DashboardPage.tsx`: indicadores IGP y sección histórica separada.
- `apps/web/src/modules/mapa-sismico/Page.tsx`: mapa IGP inicial y selector a Supabase.

## Comprobaciones

1. En `/`, comprobar la tarjeta IGP y que su último evento coincida en fecha, magnitud y referencia con el portal oficial.
2. En `/mapa-sismico`, debe estar seleccionado **IGP · Reportes recientes** de forma predeterminada; comprobar marcadores y sus ventanas emergentes.
3. Cambiar a **Catálogo almacenado · Supabase**, aplicar filtros y verificar que solo alteran los eventos almacenados; regresar a IGP.
4. Probar una falla del servicio IGP: debe aparecer un error sin presentar la muestra histórica como si fuera IGP en vivo.
5. Comprobar modo oscuro, `npm run build`, y realizar commit/push para desplegar Vercel.

## Limitaciones antes de Fase 7

- La vista IGP presenta una **muestra reciente**, no el catálogo íntegro ni un conteo nacional absoluto.
- Estos registros IGP **no se persisten todavía** en Supabase y **no activan alertas**.
- Para emitir avisos basados en eventos oficiales se necesitará ingesta programada independiente del navegador, deduplicación y trazabilidad de la fuente.
- No es un sistema de alerta temprana ni predice terremotos.
