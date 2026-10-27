# Revisión Auditoría 04 — Flechas y paginación

## Cambios

- Los detalles de actividad se muestran con una flecha hacia abajo cuando están cerrados.
- Al abrir una actividad, la misma flecha gira 180° hacia arriba; al cerrarla retorna con transición de 200 ms. Se respeta `prefers-reduced-motion`.
- Se mantiene `aria-expanded` y se actualiza la etiqueta accesible Mostrar/Ocultar detalles.
- El pie de la tabla muestra `Página X de Y`, sin repetir el número total de registros.

## Alcance

Solo `apps/web/src/modules/auditoria/Page.tsx`; no cambian filtros, backend, PostgreSQL, exportación ni colores del sistema.

## Validación

Desde la raíz del proyecto:

```bash
node --test tests/frontend/auditoria-flechas-paginacion.test.cjs
cd apps/web && npm run build
```

La segunda comprobación requiere todas las dependencias del repositorio.
