# Centro de alertas — Fase A (interfaz y navegación)

## Alcance realizado

- La única entrada de navegación es **Centro de alertas** (`/alertas`). Se eliminaron tanto el acceso del sidebar como el del menú de perfil a **Mis notificaciones**.
- Las vistas son enlaces navegables con estilo subrayado de Fuentes de datos: **Bandeja** (`/alertas`), **Reglas** (`/alertas/reglas`) y **Entregas** (`/alertas/entregas`). La URL persiste al recargar o compartir el enlace y el breadcrumb mantiene el nombre del módulo.
- Bandeja conserva sus acciones autorizadas y `TablePagination` (5/10/20). Reglas conserva las acciones en `Modal`, la simulación sin efectos secundarios y el formulario; se añadió un deslizador de magnitud, sincronizado con su control numérico, sin cambiar los requisitos del backend.
- Entregas declara **explícitamente que su historial independiente se implementará en Fase B**; no muestra filas ficticias. Se conserva, solo para Administrador, la prueba SMTP mediante botón y modal, más el panel de configuración técnica colapsado.

## Transición y seguridad

- Se conserva **temporalmente** la ruta directa `/mis-notificaciones` y sus archivos para facilitar la reversión. El módulo deja de mostrarse en la navegación, pero **la automatización personal sigue activa** hasta completar y validar las fases C–E.
- No se modificaron endpoints, tablas de PostgreSQL, secretos, credenciales SMTP ni workflows de GitHub Actions. Esta fase **NO habilita el envío operativo de correos**.
- La edición y activación de reglas, la aprobación/cancelación y la simulación siguen sometidas a autorización de FastAPI. El frontend preserva los controles de presentación por rol.

## Comprobaciones

- `node --test tests/frontend/centro-alertas-fase-a.test.cjs tests/frontend/alertas-modales-pestanas-02.test.cjs tests/frontend/alertas-tabs-shared.test.cjs`
- `cd apps/web && npm run build` (realizar en el proyecto completo, con dependencias instaladas).
- Verificar manualmente las tres rutas tras recargar; en móvil comprobar modal de crear regla, simulación y prueba SMTP; comprobar acceso por rol y que todavía lleguen los avisos personales esperados.

## Pendiente

- **Fase B**: endpoint autenticado y paginado de `alert_deliveries`, tabla real con estados/fechas/errores y protección de datos personales. Verificar en Vercel que las URL de subrutas admitan recarga directa mediante la configuración SPA del despliegue.
- **Fase C**: concurrencia, seguridad SMTP e idempotencia de entregas.
- **Fase D**: habilitación controlada del despacho operativo de emails.
- **Fase E**: desactivar primero el proceso personal y retirar su ruta/código solo después de verificar el nuevo circuito.
