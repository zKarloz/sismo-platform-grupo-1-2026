# Centro de alertas — Fase C: seguridad del despacho

## Cambios

- `app.alerts.service.dispatch()` ahora **reserva en PostgreSQL con un `UPDATE` condicional y `RETURNING`, antes de enviar por SMTP**. Dos procesos que seleccionan la misma entrega no pueden reservarla simultáneamente. El canal interno se publica y registra en una sola transacción.
- Solo se consideran alertas IGP/CENSIS, reglas activas, canales válidos y (para email) una **aprobación humana registrada**. La aprobación/cancelación y el acuse operan con transición condicional atómica y auditoría única.
- Se conservan las columnas y estados existentes de `alert_deliveries`: **no se requiere migración SQL**. La reserva para correo usa temporalmente `status=failed`, `error_code=SMTP_OUTCOME_UNKNOWN` y `next_attempt_at=NULL`; esto protege contra duplicados si el proceso se interrumpe después de reservar o si se desconoce el resultado de SMTP. La interfaz presenta esa situación en ámbar como **«Revisión requerida»**, no como fracaso confirmado.
- Solo fallos **comprobablemente anteriores a `send_message`** (`SMTP_SEND_FAILED`) reciben reintento automático, con espera de 60, 120 y hasta un máximo de tres intentos. Una excepción dentro de `send_message` puede producir un resultado ambiguo y **no se reintenta automáticamente**. No existe garantía de entrega exactamente una vez con SMTP; se prioriza evitar duplicados.
- Los códigos de error son genéricos y el endpoint de Entregas sigue ocultando destinatarios. Los detalles confidenciales de SMTP no se guardan en `audit_logs` ni se muestran en la API.
- El modal **Crear regla de alerta** ubica el campo **«Valor exacto M ≥»** a la derecha de **«Nombre de la regla»** en escritorio (apilados en móvil), conserva el deslizador sincronizado y ajusta el contraste de **«Crear regla desactivada»** para tema claro y oscuro.

## Comportamiento y límites

- **No se ha activado el envío operativo de email.** El workflow seguirá ejecutando el despachador sin `--send-email`; las notificaciones personales permanecen temporalmente activas hasta la fase E.
- Los estados `SMTP_OUTCOME_UNKNOWN` deben investigarse comparando los registros con el proveedor de correo; **no** reactivar ni editar manualmente esas entregas para reenviarlas sin confirmar primero si el correo pudo ser aceptado. Esta fase no agrega un botón de reintento manual.
- El control de reingreso/concurrencia se probó con SQLite aislado; la condición `UPDATE...RETURNING` debe validarse en PostgreSQL de Render/Supabase antes de activar correos reales. No se enviaron correos de prueba durante esta fase.
- El sistema actual admite **un destinatario por regla**. La recepción por buzón o lectura de un correo no pueden confirmarse solo por el resultado SMTP.

## Instalación y pruebas

1. Requiere las fases A y B instaladas. Guardar los cambios existentes y descomprimir `parche-centro-alertas-fase-c.zip` desde la raíz del proyecto.
2. Terminal 1 (FastAPI): reiniciar el backend con el comando habitual. Al desplegar, actualizar **Render antes que Vercel**.
3. Terminal 2 (React): `cd apps/web && npm run build && npm run dev`.
4. Terminal 3 (raíz):

   ```bash
   PYTHONPATH=services/api python -m pytest tests/backend/test_centro_alertas_fase_c.py tests/backend/test_centro_alertas_fase_b.py tests/backend/test_phase7_alerts.py -q
   node --test tests/frontend/centro-alertas-fase-c.test.cjs tests/frontend/centro-alertas-fase-b.test.cjs tests/frontend/centro-alertas-fase-a.test.cjs tests/frontend/alertas-tabs-shared.test.cjs tests/frontend/alertas-modales-pestanas-02.test.cjs
   ```

5. Revisar el modal Crear regla en escritorio y móvil, así como su botón en tema oscuro. En la pestaña Entregas, comprobar que un error `SMTP_OUTCOME_UNKNOWN` se presente como «Revisión requerida» y no como envío exitoso.

## Pruebas efectuadas en el entorno aislado

- 10 pruebas nuevas backend de Fase C, y 21 pruebas backend en total junto con Fases B y prueba de motor existente (usando un ensamblado mínimo porque el ZIP entregado no contiene todo FastAPI).
- 25 pruebas estáticas frontend acumuladas de Fases A, B, C y modales.
- Sintaxis TSX y Python verificada. No se ejecutó la compilación integral Vite ni pruebas PostgreSQL/SMTP reales; corresponden a tu entorno de desarrollo y a la Fase D.

## Próxima fase

**D — Automatización controlada:** activar SMTP operativo solo con bandera explícita y credenciales configuradas en el workflow, primero con destinatarios de prueba y alertas aprobadas. No activar simultáneamente el proceso operativo y el personal para las mismas comunicaciones.
