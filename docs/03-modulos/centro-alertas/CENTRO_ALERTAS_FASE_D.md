# Centro de alertas — Fase D: prueba controlada de correo operativo

**Alcance:** integración preliminar de GitHub Actions, sin activar el envío programado de correo operativo. Mantiene el flujo de notificaciones personales hasta la Fase E y preserva el esquema de Supabase.

## Cambios

- `.github/workflows/igp-sync.yml`: entrada manual opcional `test_operational_email` (predeterminada `false`). El paso de correo operativo solo se ejecuta si **las tres condiciones** son verdaderas: `workflow_dispatch`, entrada manual seleccionada y variable de repositorio `ENABLE_OPERATIONAL_EMAIL=true`. El cron horario **no enviará correo operativo** en esta fase.
- El paso exige secretos SMTP y `OPERATIONAL_EMAIL_TEST_RECIPIENT`. Se ejecuta `python -m app.commands.alerts dispatch --send-email` con `OPERATIONAL_EMAIL_TEST_MODE=true`. No registra correos privados ni contraseñas.
- `app.alerts.service.dispatch`: bajo el modo de prueba **solo selecciona y reserva una entrega aprobada por ejecución**, exclusivamente si `destination_ref` coincide con `OPERATIONAL_EMAIL_TEST_RECIPIENT` (comparación insensible a mayúsculas). Tanto el SELECT como la reserva condicional UPDATE comprueban el destino. Sin secreto válido falla antes de procesar la cola. Las demás entregas no cambian y la reserva atómica y la protección `SMTP_OUTCOME_UNKNOWN` de Fase C permanecen.
- Durante una ejecución manual con entrada de prueba, no se ejecutan los dos pasos de notificaciones personales de **esa ejecución**, reduciendo duplicados. El cron personal normal sigue vigente hasta el corte definitivo.
- Interfaz Entregas: tabla/tarjetas y `TablePagination` comparten un solo contenedor, sin cuadrado separado para la paginación.

## Preparación segura (GitHub)

1. En **Settings → Secrets and variables → Actions → Variables**, crear `ENABLE_OPERATIONAL_EMAIL` con valor **`false`**. Mantenerlo así hasta completar las comprobaciones locales y tener una regla de prueba válida.
2. Revisar/crear los secretos Actions `DATABASE_URL`, `ALERT_SMTP_HOST`, `ALERT_SMTP_FROM`, `ALERT_SMTP_USER`, `ALERT_SMTP_PASSWORD`; variable `ALERT_SMTP_PORT` (465 por defecto). No imprimir secretos ni pasarlos a Vite.
3. Crear secreto `OPERATIONAL_EMAIL_TEST_RECIPIENT` con **una dirección controlada y distinta de usuarios suscritos**, por ejemplo una cuenta técnica de pruebas. El destino de **la regla de correo de prueba** debe coincidir exactamente con esa dirección; no se redirigen mensajes de otras reglas.
4. Crear en Centro de alertas una regla **IGP/CENSIS**, canal **Correo**, destinatario de prueba, magnitud y zona apropiadas. La regla se crea desactivada: activarla como Administrador. Solo eventos nuevos recibidos tras la activación y que cumplan las demás condiciones generan alertas. Una simulación no genera registros.
5. En la Bandeja, aprobar una alerta de prueba como Administrador u Operador. No aprobar alertas reales destinadas a otras cuentas para esta prueba.
6. Cambiar temporalmente `ENABLE_OPERATIONAL_EMAIL` a **`true`**. Desde **Actions → Sincronización IGP a Supabase → Run workflow**, marcar **Prueba controlada** (`test_operational_email`). **No programar el envío operativo aún**. Una ejecución procesa como máximo una entrega aprobada al destino controlado; si no hay ninguna elegible, no enviará correos.
7. Revisar **Centro de alertas → Entregas**: canal correo, intentos, hora de intento, código de error y estado. `Enviada` = SMTP aceptó el mensaje; no significa recepción/lectura. Ante `SMTP_OUTCOME_UNKNOWN` se requiere comprobación manual antes de cualquier reenvío.
8. Devolver `ENABLE_OPERATIONAL_EMAIL` a **`false`** después de la prueba. Evitar repetir Run workflow hasta confirmar el estado y destino de las entregas pendientes. El cron no usa este paso ni aunque la variable sea `true`, mientras estemos en Fase D.

## Pruebas

Backend (sin Gmail ni Supabase):

```bash
PYTHONPATH=services/api python -m pytest tests/backend/test_centro_alertas_fase_c.py tests/backend/test_centro_alertas_fase_d.py -q
```

Frontend y workflow (estáticas):

```bash
node --test tests/frontend/centro-alertas-fase-c.test.cjs tests/frontend/centro-alertas-fase-d.test.cjs
```

Vite:

```bash
cd apps/web && npm run build
```

**Validado en revisión aislada:** 16 pruebas backend Fases C+D, 29 pruebas estáticas acumuladas de frontend, sintaxis TSX y YAML. Las 3 pruebas de consulta B también pasaron con un ensamblado aislado de FastAPI. **No se han realizado envíos SMTP reales ni probado contra Supabase.** Para verificar el CLI en el repositorio completo, comprobar `app.commands.alerts` con `--send-email` y el flujo real controlado antes de producción.

## Próxima fase — E

Tras comprobar aprobaciones, estados y destino en una prueba real, retirar el proceso personal del workflow; después habilitar, bajo política aprobada, el correo operativo programado. No borrar tablas ni historial personal. Revisar los correos para evitar dos avisos del mismo evento y documentar un plan de reversión. **No completar Fase E ni activar los correos generales con este parche.**
