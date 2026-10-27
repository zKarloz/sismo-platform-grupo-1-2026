# Revisión de Fuentes de datos 02 — pestañas y observaciones

## Cambios realizados

- `Fuentes de datos` utiliza dos pestañas: **Última sincronización** (por defecto) e **Historial de sincronizaciones**. Se muestra solo un panel a la vez, siguiendo el estilo de Auditoría.
- El historial se solicita cuando se abre su pestaña, manteniendo el filtro, las 5 filas iniciales y la paginación compartida (5, 10 y 20).
- Se elimina **Duración** del detalle expandido porque ya aparece en la columna principal de la tabla. Permanecen finalización, registros actualizados, ID de ejecución y observaciones.
- Las observaciones y advertencias de ejecuciones parciales se resaltan con fondo amarillo en modo claro y ámbar en oscuro; no se modifica la paleta global.

## Alcance técnico

- Solo frontend: `apps/web/src/modules/fuentes-datos/Page.tsx`.
- No cambia la ingesta IGP/CENSIS, GitHub Actions, los endpoints FastAPI, las tablas de Supabase ni las migraciones.

## Verificación

```bash
# Terminal 2 — apps/web
npm run build

# Terminal 3 — raíz del repositorio
node --test tests/frontend/fuentes-igp-ui.test.cjs tests/frontend/fuentes-tabs-observaciones.test.cjs
```

Comprobar en tema claro y oscuro, en escritorio y teléfono. La compilación completa debe ejecutarse en el repositorio local.
