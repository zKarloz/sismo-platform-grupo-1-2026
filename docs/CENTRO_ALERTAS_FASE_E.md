# Centro de alertas — Fase E: corte del correo personal

**Estado:** parche preparado, probado de forma aislada. **No despliega ni activa envíos en GitHub por sí mismo.**

## Objetivo y alcance

- Único módulo navegable: **Centro de alertas** (`/alertas`, `/alertas/reglas`, `/alertas/entregas`). La ruta `/mis-notificaciones` se retira; los componentes originales pueden permanecer en el repositorio durante la ventana de reversión, pero ya no se importan ni se navegan.
- `.github/workflows/igp-sync.yml`: elimina **ambos** pasos de `personal_notifications evaluate` y `personal_notifications dispatch --send-email`. Mantiene sincronización IGP, conciliación diaria, evaluación de reglas y publicación interna.
- Programa un despacho de **correo operativo** exclusivamente cuando `github.event_name == 'schedule'`, `vars.ENABLE_OPERATIONAL_EMAIL == 'true'` **y `vars.ENABLE_PERSONAL_EMAIL == 'false'`** (dos banderas de seguridad). La prueba manual de Fase D sigue aislada y limitada a un destinatario.
- El correo operativo solo procesa eventos IGP/CENSIS, reglas **activas**, alertas **aprobadas** por un usuario autorizado y destinatarios configurados por el Administrador. La reserva CAS y el tratamiento de resultado SMTP incierto de la Fase C permanecen intactos.
- **Frescura:** `OPERATIONAL_EMAIL_MAX_AGE_HOURS` (valor predeterminado **6**, admite de 1 a 24) calcula la antigüedad desde `seismic_events.occurred_at` en UTC, no desde la ingesta ni desde la aprobación. Los avisos históricos **no se envían**. Hasta 200 entregas IGP antiguas aprobadas por ejecución se cancelan con el código `EVENT_TOO_OLD` (sin intentar SMTP), conservando la fila y su auditoría. Una entrega con resultado SMTP incierto permanece para revisión manual.
- **Control de volumen:** `OPERATIONAL_EMAIL_BATCH_LIMIT` (predeterminado **10**, admite 1 a 50). Solo el cron de correo utiliza este límite; la prueba manual continúa limitada a **una** entrega. Los avisos internos conservan su procesamiento normal.
- Entregas indica **Caducada** en ámbar para `EVENT_TOO_OLD`; no confunde la caducidad con fallos de Gmail.
- **No se modifica ni elimina** ninguna tabla histórica (`notification_preferences`, `personal_notification_deliveries`), ni se crea migración en Supabase. Los endpoints antiguos y su implementación permanecen como legado durante la reversión, pero el workflow **ya no llama** sus comandos.

## Secuencia segura de despliegue (importante)

1. **ANTES del push**, en GitHub → Settings → Secrets and variables → Actions → Variables, poner `ENABLE_OPERATIONAL_EMAIL=false`. Aunque ahora sea `true` por pruebas, dejar `false` hasta haber desplegado y comprobado el nuevo código. No crear un periodo con dos mecanismos simultáneos.
2. Instalar parche, compilar web y ejecutar todas las pruebas. `git status`, revisar diferencias y confirmar que no se subieron ZIP ni `.env`. Hacer commit/push a `main`.
3. Comprobar el resultado **verde** de GitHub Actions y despliegues de Render/Vercel. Una ejecución de `workflow_dispatch` sin marcar la prueba no enviará correo operativo.
4. Poner `ENABLE_PERSONAL_EMAIL=false` en GitHub. **Esta variable ya no ejecuta tareas personales**, pero ahora funciona como barrera explícita de activación: mientras no sea exactamente `false`, el cron operativo permanece apagado.
5. Revisar `Centro de alertas → Reglas`: reglas IGP email activas, destinatario de correo autorizado, `requires_approval=true`. Revisar Bandeja y Entregas para verificar estado de aprobación y cola. Verificar que las direcciones y credenciales SMTP estén en secretos, no en archivos del frontend.
6. En GitHub → Variables, configurar (si se desea) `OPERATIONAL_EMAIL_MAX_AGE_HOURS=6`, `OPERATIONAL_EMAIL_BATCH_LIMIT=10`. Mantener `ALERT_SMTP_PORT=465` si Gmail usa SSL. Los secretos SMTP existentes se reutilizan.
7. **Solo tras validar el código y destinatarios**, activar `ENABLE_OPERATIONAL_EMAIL=true`. La **siguiente ejecución programada** (17 minutos de cada hora UTC y conciliación diaria a las 08:33 UTC) procesará como máximo 10 entregas elegibles. Los eventos que superen las 6 horas se cancelarán sin correo. Confirmar `sent`, `failed`, `uncertain`, `expired` en los logs, Entregas y el correo controlado. El cron puede retrasarse; no se trata de un servicio de alerta temprana.
8. Si existe un fallo o se detectan envíos inesperados, cambiar **inmediatamente** `ENABLE_OPERATIONAL_EMAIL=false`, revisar la Bandeja, Entregas y logs, y no volver a activar automáticamente el proceso personal: solo restaurarlo si se decide un rollback completo, con el operativo apagado.

## Contrato de seguridad

- Una alerta `pending` sin aprobación, `cancelled` o una regla desactivada **no puede enviar** correo operativo.
- `SMTP_OUTCOME_UNKNOWN` continúa sin reintento automático; SMTP aceptado **no garantiza recepción o lectura**.
- Evento de más de 6 horas: se conserva la alerta y se cancela únicamente la entrega pendiente/reintentable aprobada; no se altera un correo ya enviado.
- El correo se limita a destinatarios configurados por el administrador y a una fuente oficial IGP/CENSIS. No es una alerta temprana, no predice sismos.

## Validación local

```bash
PYTHONPATH=services/api python -m pytest \
  tests/backend/test_centro_alertas_fase_c.py \
  tests/backend/test_centro_alertas_fase_d.py \
  tests/backend/test_centro_alertas_fase_e.py -q

node --test tests/frontend/centro-alertas-fase-*.test.cjs \
  tests/frontend/alertas-tabs-shared.test.cjs \
  tests/frontend/alertas-modales-pestanas-02.test.cjs

cd apps/web && npm run build
```

**Comprobación en revisión aislada:** 25 pruebas backend Fases C/D/E y 33 pruebas estáticas frontend (sin SMTP real ni Supabase); análisis de sintaxis Python/TSX y lectura YAML. El proyecto completo requiere ejecutar sus pruebas en el repositorio, CI y validar entregas reales controladas.

## Reversión y cierre

- Reversión inmediata del envío operativo: `ENABLE_OPERATIONAL_EMAIL=false`.
- El código de preferencias personales y sus tablas no se borran: permiten restauración mediante un commit reversible, pero se recomienda **no reactivar ambos cron simultáneamente**.
- Los accesos personales ya no deben aparecer en el menú ni ser accesibles por la ruta antigua. Sus datos históricos permanecen en Supabase.
- No hay migración de esquema requerida. Para borrado definitivo posterior de componentes legados, revisar referencias con `git grep personal_notifications` y planificar una limpieza independiente tras estabilización.
