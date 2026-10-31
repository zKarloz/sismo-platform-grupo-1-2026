# Fase 7 — Cierre funcional y verificación pendiente

**Fecha de revisión:** 24/10/2026 (hora de Perú). **Estado:** desarrollo funcional concluido; validación de entrega sísmica automática pendiente.

- Regla interna IGP M ≥ 4.0 activada y evaluada; los avisos de revisión requieren aprobación Administrador/Operador. La aprobación autoriza **publicar por el canal de la regla**, no controla la visibilidad previa de la bandeja.
- Motor con fuente verificada, deduplicación por evento/regla, cooldown, aprobación, reintentos limitados y auditoría.
- SMTP Gmail: el correo de prueba técnica se recibió realmente el **24/10/2026 14:05 hora peruana**. **No era un sismo real**.
- Suscripciones personales: cada usuario puede seleccionar correo y magnitud mínima, independientemente de su rol; no modifican las reglas globales ni requieren aprobación operativa individual.
- GitHub Actions: ingesta horaria, cola personal y envío SMTP habilitado (`email_enabled: true`). La ejecución comprobada devolvió `sent: 0`, `failed: 0`: **sin correos elegibles en ese momento**.
- Registro IGP `partial` esperado si alguna fila carece de fecha: no presentar 100/100 como procesadas cuando hay descartes.

**Pendiente de aceptación operativa:** tras un nuevo evento real elegible publicado por IGP y recibido después de la suscripción, comprobar `personal_notification_deliveries.status='sent'`, mensaje recibido y tiempo real de emisión. Para una regla global de correo, comprobar adicionalmente aprobación y el historial `alert_deliveries`.

**Limitaciones:** los avisos describen eventos ya ocurridos, no constituyen predicción ni alerta temprana. GitHub Actions tiene frecuencia nominal de una hora, sin garantías de puntualidad. La aceptación SMTP del mensaje no demuestra lectura ni entrega final al buzón.

**Integridad:** no se modifican `datasets`, `dataset_snapshots` ni `ml_experiments`.
