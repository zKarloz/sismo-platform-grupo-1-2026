# Revisión 02 — Alertas internas y Mis notificaciones

**Alcance:** presentación de pestañas y formularios del frontend. No cambia la API, el esquema SQL ni las reglas de negocio.

- Ambos módulos usan pestañas subrayadas (mismo patrón de `Fuentes de datos`).
- En **Reglas**, las acciones **Crear regla de alerta** y **Probar regla** son botones compactos; los formularios se muestran dentro de `components/ui/Modal.tsx`.
- En **Canales**, **Probar mi Gmail desde la web (opcional)** aparece en la esquina superior derecha y abre el mismo modal compartido. La contraseña de aplicación permanece en estado temporal del formulario y se descarta al cerrarlo.
- Se conservan el acceso por rol, las verificaciones del formulario, la creación desactivada de reglas y la simulación sin envío ni escritura.
- No se modifican los tonos globales del tema oscuro, las consultas, los endpoints ni la base de datos.

## Validación

Desde la raíz del repositorio:

```bash
node --test tests/frontend/alertas-tabs-shared.test.cjs tests/frontend/alertas-modales-pestanas-02.test.cjs
```

Desde `apps/web`: `npm run build`. Comprobar además en PC y móvil el scroll y cierre de los tres modales y los permisos de Administrador, Operador y Analista.
