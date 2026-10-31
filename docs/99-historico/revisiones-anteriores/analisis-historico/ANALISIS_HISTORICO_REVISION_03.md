# Análisis histórico — Revisión 03: selector mensual y textos

## Cambios
- `FilterBar.tsx`: el modal compartido cambia el título visible **Filtros compartidos** por **Filtros**.
- Solo en Análisis histórico, el campo nativo `type="month"` se sustituye por una **lista de los doce meses** y otra lista compacta para el **año**, evitando mezclar meses de años distintos.
- Se eliminan únicamente los dos mensajes explicativos solicitados bajo los selectores de mes y departamento.
- Al cambiar o limpiar el mes se vacían los borradores Desde/Hasta; al seleccionar un mes completo se preserva la conversión al día civil de Perú (`UTC-05`) y, al limpiar la selección, pueden volver a usarse fechas manuales.
- No se modifica el selector de departamento, el panel lateral, la consulta IGP/CENSIS, la API ni la exportación CSV.

## Comprobación
- Ejecutar `node --test tests/frontend/analisis-historico-revision-01.test.cjs tests/frontend/analisis-historico-filtros-02.test.cjs tests/frontend/analisis-historico-selectores-03.test.cjs`.
- Ejecutar `cd apps/web && npm run build` y revisar el modal en escritorio/móvil, con tema claro y oscuro.

## Despliegue
Solo frontend: publicar Vercel después de verificar. Sin cambios de FastAPI, Supabase o GitHub Actions.
