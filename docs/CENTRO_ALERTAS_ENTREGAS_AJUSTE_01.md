# Centro de alertas — Ajuste visual de Entregas 01

## Alcance

- La tabla de Entregas despliega una **fila horizontal completa** bajo la entrega seleccionada, siguiendo el historial de Fuentes de datos. La flecha `ChevronDown` gira 180° y expone `aria-expanded`.
- En teléfonos, la misma información aparece ordenada en un panel dentro de la tarjeta. Se mantiene el contenedor único de tabla y `TablePagination` (5/10/20).
- El panel ampliado utiliza fondo amarillo claro y ámbar oscuro, con una observación específica para entregas caducadas, resultados SMTP inciertos u otros códigos de incidencia.
- Los filtros **Caducada** (`status=expired`) y **Cancelada** (`status=cancelled`) ahora son distintos. No cambia el enum SQL: `EVENT_TOO_OLD` diferencia la caducidad técnica. Esto se resuelve en el endpoint con paginación SQL, evitando inconsistencias entre páginas.
- Destinatarios enmascarados, código de error seguro y permisos de lectura se mantienen.

## Archivos

- `apps/web/src/modules/alertas/Page.tsx`
- `services/api/app/routes/alerts.py`
- `tests/backend/test_centro_alertas_fase_b.py`
- `tests/frontend/centro-alertas-entregas-ajuste-01.test.cjs`

## Validación

Ejecutar desde la raíz:

```bash
PYTHONPATH=services/api python -m pytest tests/backend/test_centro_alertas_fase_b.py -q
node --test tests/frontend/centro-alertas-entregas-ajuste-01.test.cjs
cd apps/web && npm run build
```

No modifica workflows, SMTP, variables, migraciones ni tareas programadas. Para despliegue: actualizar primero FastAPI en Render y después la interfaz en Vercel. Revisar el detalle expandido en escritorio, móvil, claro y oscuro.
