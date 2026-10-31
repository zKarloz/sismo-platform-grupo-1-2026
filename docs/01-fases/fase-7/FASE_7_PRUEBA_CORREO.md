# Fase 7 — Validación del canal de correo (SMTP)

## Objetivo y límites

Verificar que el sistema puede **enviar un correo de prueba claramente identificado** sin inventar un evento ni crear una alerta retroactiva. Este comando **no accede a Supabase, no crea registros en `alerts` ni en `alert_deliveries`** y no modifica datasets ni experimentos de ML.

La entrega operativa y su auditoría continúan a cargo del motor Fase 7: nuevo sismo verificado → regla activada → `pending` → aprobación humana → `dispatch --send-email` → estado `sent`/`failed` en `alert_deliveries`. El éxito SMTP indica aceptación por el servidor, **no lectura ni entrega garantizada al buzón**.

## Configuración local (Git Bash; terminal 3)

```bash
cd services/api
source .venv/Scripts/activate

# Ejemplo Gmail: usar contraseña de aplicación, no contraseña normal.
export ALERT_SMTP_HOST="smtp.gmail.com"
export ALERT_SMTP_PORT="465"
export ALERT_SMTP_FROM="TU_REMITENTE@gmail.com"
export ALERT_SMTP_USER="TU_REMITENTE@gmail.com"
read -rsp "Contraseña de aplicación SMTP: " ALERT_SMTP_PASSWORD
printf '\n'
export ALERT_SMTP_PASSWORD

# Comprobación sin envío.
python -m app.commands.test_alert_email --to "TU_DESTINATARIO@correo.com"

# Enviar UN mensaje explícitamente identificado como PRUEBA.
python -m app.commands.test_alert_email --to "TU_DESTINATARIO@correo.com" --send
```

No compartir capturas con valores de credenciales. No publicar `ALERT_SMTP_PASSWORD`, `DATABASE_URL` o claves `sb_secret` en Git, Vercel ni Actions. Las variables se eliminan de la sesión al cerrar la terminal (puedes ejecutar `unset ALERT_SMTP_PASSWORD` antes). Gmail requiere verificación en dos pasos para generar contraseña de aplicación, sujeto a disponibilidad de la cuenta.

## Configurar aviso operativo

No hace falta crear un nuevo usuario Supabase Auth: el destinatario puede ser cualquier buzón permitido. Desde la **terminal privada**, con credenciales de BD:

```bash
python -m app.commands.alerts create-rule \
  --actor-email admin@splatform.com \
  --name "IGP correo personal M3.5" \
  --min-magnitude 3.5 \
  --source IGP/CENSIS \
  --channel email \
  --destination "TU_DESTINATARIO@correo.com" \
  --severity review
```

Guardar el `rule_id` devuelto. La regla nace **desactivada**:

```bash
python -m app.commands.alerts activate-rule \
  --id UUID_DE_LA_REGLA \
  --actor-email admin@splatform.com
```

La regla opera desde su activación: un sismo ya ingresado no genera automáticamente un correo nuevo. La frecuencia de GitHub Actions es **horaria, sin garantía de puntualidad**. Su workflow **no** tiene activado `--send-email`.

Cuando el IGP publique un **nuevo** sismo que coincida y el motor genere un aviso, ingresar a `/alertas` como Administrador u Operador para aprobarlo con una sesión autenticada. Luego enviar desde terminal privada:

```bash
python -m app.commands.alerts dispatch --send-email
```

Este envío puede procesar **todos los correos aprobados pendientes** que estén elegibles en la BD, no solo uno. Revisar `/alertas` antes de ejecutarlo. Se permiten hasta 3 intentos con espera progresiva, y los fallos genéricos quedan registrados sin publicar credenciales. Si el SMTP acepta el mensaje pero hay un fallo en PostgreSQL antes de registrar el resultado, puede producirse un segundo correo por reintento: la entrega es *at-least-once*, no exactamente una vez.

## Comprobar el historial en Supabase

```sql
-- Ver los últimos envíos y sus reintentos sin mostrar destinatarios.
SELECT
  ar.name AS regla,
  a.id AS alerta_id,
  a.status AS estado_alerta,
  d.channel AS canal,
  d.status AS estado_entrega,
  d.attempts AS intentos,
  d.delivered_at AT TIME ZONE 'America/Lima' AS aceptado_smtp_peru,
  d.error_code
FROM public.alert_deliveries AS d
JOIN public.alerts AS a ON a.id = d.alert_id
JOIN public.alert_rules AS ar ON ar.id = a.rule_id
ORDER BY d.created_at DESC
LIMIT 20;
```

**Nota:** el correo de prueba **no** aparecerá aquí; solamente los avisos operativos aprobados y enviados por el motor de la Fase 7.

## Verificación y documentación

- `python -m pytest ../../tests/backend/test_alert_email_smoke.py -q` sin red ni envío real.
- `python -m pytest ../../tests/backend -q` para regresión.
- Confirmar llegada del correo de prueba y comprobar el asunto **`[PRUEBA]`**.
- Confirmar después una entrega operativa y su auditoría, sin crear sismos inventados.
- Registrar el resultado manual en `docs/FASE_7_ENTREGA.md`, sin publicar direcciones personales.
