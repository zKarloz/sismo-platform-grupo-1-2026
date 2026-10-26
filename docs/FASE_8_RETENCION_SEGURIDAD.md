# Fase 8 — Retención y seguridad de informes

- `report_history_days` (7–730, inicial 90) define `expires_at` del **manifiesto** registrado, no del archivo: el archivo nunca se conserva en el servidor.
- La purga de manifiestos es **manual** con `python -m app.commands.prune_reports --apply` y deja un resumen inmutable en `audit_logs`; el comando sin banderas solo calcula candidatos.
- `audit_retention_days` (365–3650, inicial 365) es una **política mínima de conservación**, no un borrado programado. `audit_logs` está protegido contra UPDATE/DELETE. Archivado, control de custodios, verificación del archivo y purga legal requieren otro procedimiento de gobierno antes de habilitarse.
- No se guardan IP, credenciales, tokens, contraseñas SMTP ni claves privadas en los reportes. El campo `correlation_id` se conserva cuando la acción originaria lo proporciona. No se inventan datos de MFA.
- Solo backend con `DATABASE_URL` privilegiada accede a las tablas; RLS para clientes anon/authenticated permanece activo. El archivo se transmite únicamente tras verificar JWT y RBAC.
- El SHA256 demuestra integridad del archivo descargado; no firma su autoría ni garantiza que datos de proveedores externos no cambien después.
- Reportes PDF limitados a 400 filas; CSV/XLSX limitados por configuración `max_report_rows` (50–5000). Si el resultado excede el límite, API devuelve 413 y exige acotar filtros.
- Al dar acceso al repositorio público, revisar configuración Vercel/Render y secretos. **Nunca** añadir `DATABASE_URL`, `sb_secret`, `service_role` o SMTP a variables `VITE_*`.
- Auditoría y exportaciones requieren controles reales del backend, no solo ocultar botones de React.
