# Revisión 01 — Unificación de modales

## Alcance

- Reportes: generación, configuración y detalle de filtros usan `components/ui/Modal.tsx`.
- Usuarios y roles: alta, edición y detalles usan `Modal.tsx`.
- Mis notificaciones: edición de preferencias usa `Modal.tsx`.
- Dashboard/Mapa, Auditoría: ya utilizaban el modal compartido y no se sobrescribieron.
- El botón **Generar y descargar** de Reportes recibe fondo claro y texto oscuro en tema oscuro, igual que **Nuevo reporte**.

## Comportamiento preservado

El mismo modal gestiona el desenfoque de fondo, portal sobre `document.body`, Escape, foco, bloqueo de desplazamiento y distribución responsiva. El modo `mobileSheet` de Auditoría permanece sin cambios: esta unificación no lo extiende a otros módulos mientras se investiga su problema en teléfonos. Se conservan datos, acciones, validaciones, permisos y endpoints. No se cambian los tokens de la paleta ni la base de datos.

## Verificación

Ejecutar en la raíz:

```bash
node --test tests/frontend/modales-compartidos.test.cjs
```

Y desde `apps/web`:

```bash
npm run build
```

Comprobar manualmente los modales en escritorio y teléfono, en ambos temas. La unificación **no demuestra todavía** cuál es la causa de la anomalía móvil específica de Auditoría.
