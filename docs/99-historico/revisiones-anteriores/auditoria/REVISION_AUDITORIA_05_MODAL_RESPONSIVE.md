# Revisión de Auditoría 05 — Modal responsive

## Problema reportado
En teléfonos, el modal de filtros se mostraba demasiado grande o desbordado, con controles de fecha y acciones poco adaptados al ancho disponible.

## Cambios
- `components/ui/Modal.tsx`: opción `mobileSheet` **optativa** (valor predeterminado `false`) para mostrar un panel inferior adaptado a móviles; viewport dinámico, scroll vertical y área segura del dispositivo.
- `modules/auditoria/Page.tsx`: activa esta opción solo en filtros de Auditoría; inputs y campos de fecha con ancho flexible y mínimo cero; botones en dos filas en móvil (Limpiar / Cancelar + Aplicar), una fila en escritorio.
- `tests/frontend/auditoria-modal-mobile.test.cjs`: comprobaciones estáticas para evitar regresiones.

## Sin alteraciones
No se modifican filtros aplicados, búsqueda, exportación, paginación, estilos de estados, paleta global, FastAPI ni PostgreSQL. Los modales del Dashboard y Mapa conservan su presentación por defecto.

## Validación
Desde la raíz: `node --test tests/frontend/auditoria-modal-mobile.test.cjs`.
Desde `apps/web`: `npm run build`.
En navegador móvil o emulador: comprobar 320, 375 y 430 px y orientación horizontal, así como abrir/cerrar, Cancelar, Limpiar y Aplicar filtros.
