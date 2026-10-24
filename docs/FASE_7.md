# Fase 7 — Reglas y centro de alertas informativas

## Alcance y garantía

Avisos **posteriores** a sismos ya publicados y persistidos por IGP/CENSIS. **No son alertas tempranas ni avisos oficiales.** Ningún modelo de ML interviene en reglas o avisos. Las tablas `datasets`, `dataset_snapshots` y `ml_experiments` permanecen intactas.

Se reutilizan `users`, `alert_rules`, `alerts`, `audit_logs` de la migración 001. La migración `004_alert_center.sql` agrega `alert_deliveries` y metadatos de regla; no reemplaza tablas ni altera snapshots.

## Capacidades

- Fuente permitida: IGP/CENSIS, magnitud mínima, profundidad máxima opcional, zona rectangular `bbox`, horario peruano opcional, cooldown, prioridad operativa (`info/review/high`) y plantillas con marcadores permitidos.
- Reglas inicialmente desactivadas. Activación explícita, aplicada solo a eventos `received_at >= activated_at` y con `occurred_at` de las últimas 24 horas. Las pruebas históricas usan `simulate`, sin inserciones.
- Deduplicación por `(event_id, rule_id)` y cooldown por regla. La ejecución es idempotente; bloqueo transaccional para evaluaciones en PostgreSQL.
- Revisión humana privada: `approve` / `cancel`. Se requiere aprobación para `email`; se recomienda para todos los casos operativos. `in_app` es el canal inicial. Sin aprobaciones, solo notificaciones internas de reglas creadas con `--no-approval` se publican automáticamente.
- Historial de entregas, reintentos (hasta 3, backoff de 60, 120 s) y auditoría de altas, activaciones, aprobaciones, entregas y acuses manuales. `in_app/sent` equivale a publicación, **no lectura confirmada**.
- Correo SMTP es **opcional**, apagado por defecto; se ejecuta únicamente con `dispatch --send-email`, reglas aprobadas y credenciales configuradas en el ambiente local. No se habilita en el cron de GitHub.
- API REST **GET** `/api/v1/alerts` y **GET** `/api/v1/alert-rules`; sin destinatarios en respuestas. No existen rutas de escritura públicas.

## Instalación

1. Respaldar cambios y descomprimir el parche desde la raíz del proyecto.
2. Ejecutar en Supabase SQL Editor `database/migrations/004_alert_center.sql`.
3. Ejecutar `database/checks/006_verify_alerts.sql` para confirmar RLS y estructura.
4. Reiniciar FastAPI y ejecutar tests.

```bash
cd services/api
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
```

### Preparar el operador (solamente una vez)

**Advertencia de seguridad:** la Fase 2 (autenticación de usuarios) aún está pendiente. El correo identificado con `--actor-email` solo deja constancia de la identidad declarada por quien ya posee `DATABASE_URL`, **no verifica su identidad**. Mantener estas órdenes en un equipo o ejecutor privado. No exponerlas en FastAPI ni GitHub Actions.

```bash
# Correo interno de ejemplo, reemplazar por uno elegido por el equipo.
python -m app.commands.alerts bootstrap-operator \
  --email responsable@proyecto.local --name "Operador responsable"
```

### Crear regla de prueba y simularla (sin emitir avisos)

```bash
# Cambiar correo por el mismo indicado arriba.
python -m app.commands.alerts create-rule \
  --actor-email responsable@proyecto.local \
  --name "IGP M4 Peru - revision" \
  --min-magnitude 4.0 \
  --source IGP/CENSIS \
  --severity review \
  --channel in_app \
  --cooldown-seconds 1800 \
  --zone '{"min_lat":-19.5,"max_lat":0.5,"min_lon":-84,"max_lon":-68}'

# Obtén el UUID de la regla en la salida; obtén un UUID de evento desde /api/v1/events.
python -m app.commands.alerts simulate --rule-id UUID_REGLA --event-id UUID_EVENTO
```

El `simulate` verifica los umbrales, la fuente y la zona sobre un evento ya almacenado. **No escribe en Supabase, ni crea avisos, ni envía correos.**

### Activar, revisar y publicar

```bash
python -m app.commands.alerts activate-rule --id UUID_REGLA --actor-email responsable@proyecto.local
python -m app.commands.alerts evaluate
python -m app.commands.alerts dispatch
# Si un evento NUEVO coincide, aparecerá como pending hasta aprobarlo.
python -m app.commands.alerts approve --id UUID_ALERTA --actor-email responsable@proyecto.local
python -m app.commands.alerts dispatch
# Alternativa sin entrega: cancel --id UUID_ALERTA --actor-email ...
```

**Importante:** al activar una regla no se fabricarán avisos sobre registros históricos previos. Hasta que se ingiera un evento reciente **después** de la activación, `evaluate` puede informar `generated: 0`, lo cual es correcto. El cron ya ejecuta `evaluate` y `dispatch` después de sincronizar IGP. Si esa sincronización falla, los pasos posteriores no deben ocultar el error.

### Correos SMTP (solo opción avanzada)

Configurar privadamente `ALERT_SMTP_HOST`, `ALERT_SMTP_PORT` (465), `ALERT_SMTP_FROM`, `ALERT_SMTP_USER`, `ALERT_SMTP_PASSWORD`. Crear regla `--channel email --destination persona@example.org` (obliga a aprobar). Una vez aprobada, realizar `python -m app.commands.alerts dispatch --send-email` desde terminal privada. **No incluir variables SMTP en Vercel ni en GitHub Actions.** Esta funcionalidad no ha sido verificada con un proveedor SMTP real.

## Validación

- `pytest` incluye pruebas aisladas para simulación sin efectos, gating temporal, fuente, magnitud, profundidad, zona, cooldown, aprobación, deduplicación, canal interno, correos simulados, reintentos, auditoría y rutas GET de lectura limitada.
- Verificar `npm run build` en VS Code, ya que el entorno de preparación no disponía de dependencias npm instaladas.
- Verificar `GET /api/v1/alert-rules`, `GET /api/v1/alerts` y la página `/alertas` localmente.
- Hacer commit y `git push origin main` solo tras ejecutar la migración, las pruebas y revisar `.env`/secretos.
- El cron de GitHub Actions ejecuta cada hora (sujeto a posibles demoras): **no cumple requisitos de alertas de emergencia ni de baja latencia garantizada**.

## Pendientes conscientes

- Fase 2: autenticación real, RBAC por endpoint, controles administrativos y validación verificable de aprobadores. Por eso no hay constructor de reglas activable desde la web.
- Polígonos geográficos y destinatarios/grupos múltiples: actualmente se admiten zonas rectangulares y un destino por regla; ampliar tras requerimientos operativos.
- Conciliación entre IGP y USGS y auditoría de correos entregados/abiertos: no se infiere que dos fuentes refieran el mismo sismo; no se emiten alertas oficiales.
- Riesgo de duplicado externo si SMTP confirma envío pero falla PostgreSQL antes de registrar la entrega: semántica de correo **at-least-once**; requeriría proveedor con clave idempotente para garantía mayor.
