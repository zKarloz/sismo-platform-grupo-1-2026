# Revisión Auditoría 03 — Filtros en modal

Fecha: 26/10/2026

## Cambio

- En **Historial**, la barra presenta en este orden: búsqueda, **Filtros**, **Exportar auditoría**.
- Se reutiliza `apps/web/src/components/ui/Modal.tsx`, ya existente. No se duplica su implementación.
- El modal agrupa **Categoría**, **Resultado** y **Fechas desde/hasta (Perú)**.
- Los cambios permanecen en borrador hasta **Aplicar filtros**; **Cancelar**, Escape y cerrar descartan el borrador.
- **Limpiar** solo restablece el formulario; para consultar sin filtros es necesario pulsar **Aplicar filtros**.
- Se deshabilita **Aplicar filtros** si el inicio es posterior al fin y se indica el error.
- Se mantiene el contador de filtros activos junto al botón, la búsqueda independiente, el selector 5/10/20 y la exportación con los criterios ya aplicados.

## Alcance técnico

Se modifica exclusivamente `apps/web/src/modules/auditoria/Page.tsx`. No hay migraciones SQL, cambios de API ni ajustes de la paleta global. Se agrega una prueba estática ligera del frontend.

## Validación

En Git Bash, desde la raíz:

```bash
node --test tests/frontend/auditoria-filtros-modal.test.cjs
```

Desde `apps/web`:

```bash
npm run build
npm run dev
```

Validación manual: abrir/cerrar modal, Escape, Limpiar/Cancelar/Aplicar, fechas inválidas, reset de página, exportación filtrada y apariencia claro/oscuro.
