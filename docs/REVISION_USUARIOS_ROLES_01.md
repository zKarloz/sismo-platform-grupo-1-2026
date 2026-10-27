# Revisión 01 — Usuarios y roles

**Base:** apartado 6.12 del plan técnico, implementación existente de React + FastAPI + PostgreSQL.

## Cambios

- Tabla con columnas independientes de **Último acceso** y **Fecha de alta**; formato de fecha/hora en Perú.
- Estados de cuenta en colores semánticos tanto en claro como en oscuro: activo (verde), suspendido (ámbar), inactivo (rojo). Identidad sin vincular (ámbar).
- Nuevo componente `apps/web/src/components/ui/TablePagination.tsx`: selector **5, 10, 20** y texto `Página X de Y` con flechas. Es controlado, no altera las consultas.
- Uso del paginador compartido en **Usuarios y roles** (5 por defecto) y **Auditoría** (conserva 10 por defecto).
- Modal de detalle: datos de identidad, últimos accesos y permisos **comprobados únicamente para el módulo Usuarios y roles**. MFA se declara *no disponible en la API actual* en lugar de inventarse.
- Encabezado limpio sin nombres de fases o versiones. Preservados modales de alta/edición, roles existentes, filtros, `LoadingSpinner` y autorización FastAPI.

## Backend / persistencia

Sin migraciones ni cambios backend. `/api/v1/admin/users` ya implementa consulta paginada y filtros RBAC y soporta `page_size=5,10,20`. El último acceso proviene de `last_login_at` y la fecha de alta de `created_at`.

**Límite MFA:** aún no se consulta el nivel de aseguramiento de Supabase Auth ni se verifica `aal2` para los endpoints administrativos. No se interpreta la ausencia del campo como MFA deshabilitado. Para una matriz completa de permisos de toda la plataforma deben revisarse también los demás routers y su política RBAC. No se modifica la política de acceso actual.

## Validación

- `node --test tests/frontend/usuarios-roles-paginacion.test.cjs`
- `cd apps/web && npm run build`
- `PYTHONPATH=services/api python -m pytest tests/backend/test_phase2_user_web_admin.py tests/backend/test_phase2_identity.py -q`
- En navegador (Administrador y Auditor): probar búsqueda, filtros, 5/10/20, límites de paginación, detalle, cuenta propia sin botón Editar, altas y cambios de estado, tema claro y oscuro.

**Nota:** pruebas estáticas y sintaxis TSX verificadas en el paquete; compilación Vite y regresión integrada pendientes de ejecutar en el repositorio completo.
