# Revisión de Alertas internas y Mis notificaciones — 01

## Alcance
- Se mantienen **dos módulos independientes** por separación de funciones y permisos.
- Alertas internas: pestañas `Centro de alertas`, `Reglas`, `Canales`.
- Mis notificaciones: pestañas `Preferencias`, `Historial`.
- El encabezado de cada módulo muestra título y descripción, sin etiquetas de fase o «V2».

## Funcionalidad
- Paginación del servidor con `TablePagination`: 5 registros inicialmente, opción 5/10/20.
- Indicadores de estado verdes, ámbar y rojos, incluso en tema oscuro (sin modificar la paleta global).
- Las lecturas `/api/v1/alerts` y `/api/v1/alert-rules` requieren sesión activa y están restringidas a IGP/CENSIS; las operaciones de escritura mantienen sus permisos por rol.
- Centro de alertas: aprobación, estado, intentos, acuse, fecha de envío y código genérico de error; no se devuelven direcciones de destinatarios.
- Reglas: simulación sobre eventos IGP recientes, disponible para Administrador, Analista y Operador de alertas, sin persistencia ni envíos.
- Canales: configuración y prueba SMTP disponible solo para Administrador; secretos nunca se exponen en lecturas.
- Mis notificaciones: consentimiento y preferencias personales sin cambios en el backend; historial aislado por cuenta.

## Seguridad y despliegue
- No requiere migraciones PostgreSQL.
- **Desplegar primero FastAPI y luego Vercel**: ahora los endpoints de lectura exigen JWT y el selector de simulación requiere un nuevo endpoint.
- A partir de ahora, los consumidores externos de `/api/v1/alerts` y `/api/v1/alert-rules` deben enviar autenticación válida.

## Validación pendiente en repositorio completo
- Compilación `npm run build` en `apps/web`.
- Pruebas backend: `test_alertas_review_01.py`, `test_phase7_alerts.py`, `test_phase7_web_rules_smtp.py`, `test_personal_notifications.py`.
- Prueba frontend: `tests/frontend/alertas-tabs-shared.test.cjs`.
- Revisión visual en pantalla pequeña, tema oscuro y permisos de cinco roles.
