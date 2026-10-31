# Fase 7 — Constructor web de reglas y prueba Gmail

## Alcance implementado

- **Centro de alertas → Crear regla**: Administrador elige nombre, magnitud mínima, fuente IGP/CENSIS, canal interno/correo, destinatario, severidad, cooldown y, opcionalmente, profundidad, bbox, horario y plantillas. Se crea siempre **desactivada**. La activación sigue bajo RBAC Administrador y es auditada. Se usa el modelo de reglas existente; **no requiere migración**.
- Para correo, **aprobación humana obligatoria** en API y en el motor de reglas. El formulario no solicita ni almacena SMTP password al guardar la regla.
- **Centro de alertas → Correo (Gmail SMTP)**: guía de verificación en dos pasos y contraseña de aplicación, y estado de presencia de variables en FastAPI sin exponer sus valores.
- **Prueba web opcional**: Administrador introduce temporalmente dirección Gmail remitente y una contraseña de aplicación de 16 caracteres. FastAPI manda **un correo marcado PRUEBA exclusivamente a la dirección del usuario administrador autenticado**. Se usa conexión SMTP SSL `smtp.gmail.com:465`, no se permite configurar host, puerto ni destinatarios arbitrarios desde esta ruta.
- La contraseña de aplicación **no se persiste** en base de datos, localStorage, logs de auditoría ni estado de sesión. El input se limpia después de enviar, y el backend la descarta tras el intento. El cuerpo no contiene información sísmica. Límite de **3 intentos por usuario / 15 minutos**, registrado en `audit_logs` sin datos sensibles.
- Avisos SMTP operativos permanecen bajo `python -m app.commands.alerts dispatch --send-email`, **luego de aprobación humana**. El formulario web solo prueba el canal y **no configura credenciales de envío permanente**; para ello deben configurarse como secretos del backend (Render o entorno privado): `ALERT_SMTP_HOST`, `ALERT_SMTP_PORT`, `ALERT_SMTP_FROM`, `ALERT_SMTP_USER`, `ALERT_SMTP_PASSWORD`. No poner claves en Vercel ni en prefijos `VITE_`.

## Seguridad y limitaciones

1. Solo usuarios con rol **Administrador** pueden crear reglas y realizar la prueba Gmail. Los demás pueden leer reglas e historial si tienen acceso a la aplicación. Backend **siempre valida JWT y rol**, no depende de ocultar controles.
2. La prueba web envía contraseña temporal por **HTTPS** a FastAPI. No se recomienda hacerla en dispositivos compartidos ni en entornos de confianza incierta. La ruta no tiene capacidad de retransmitir spam a destinatarios elegidos por el cliente, pues manda únicamente al correo del usuario autenticado.
3. El resultado `accepted_by_smtp` expresa aceptación del servidor Gmail, **no lectura ni entrega final**.
4. No se pueden editar reglas existentes desde este formulario; deben desactivarse y reemplazarse por una regla nueva. Personalización libre de suscripciones por roles no administradores requeriría permisos y modelo de preferencias independientes.
5. La bbox por defecto es aproximada: incluye coordenadas vecinas y **no equivale al contorno oficial del Perú**. El motor solo evalúa sismos observados, recibidos tras la activación y recientes; **no predice sismos ni es alerta temprana oficial**.
6. IGP se sincroniza de manera horaria mediante GitHub Actions; no se garantiza puntualidad ni envío automático de correos desde ese workflow.

## Procedimiento (3 terminales)

Terminal 1 (FastAPI):

```bash
cd services/api
source .venv/Scripts/activate
python -m uvicorn app.main:app --reload --port 8000
```

Terminal 2 (React):

```bash
cd apps/web
npm run build
npm run dev
```

Terminal 3 (pruebas):

```bash
cd services/api
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
```

1. Acceder como Administrador a `/alertas` → **Crear regla de alerta**; seleccionar email y destinatario. Guardar. Verificar que la regla aparezca desactivada y auditoría registre `alert.rule.created`.
2. Activar la regla solo después de revisarla. No se generan avisos históricos.
3. En el panel Gmail, comprobar la verificación en dos pasos y crear una contraseña de aplicación de Google si hiciera falta. La prueba SMTP es opcional y sus credenciales no quedan guardadas.
4. Usar una cuenta de rol Solo lectura y comprobar que las peticiones POST a `/admin/alert-rules` y `/admin/smtp/gmail-test` devuelvan HTTP 403.
5. Verificar historial de pruebas en Auditoría. Para entrega real esperar evento nuevo elegible, aprobar aviso y usar `dispatch --send-email` desde un backend con SMTP configurado.

**Estado de validación:** suite backend de 80 pruebas pasó en el entorno de preparación; el build completo Vite/TypeScript y el envío web SMTP real deben comprobarse en el equipo del proyecto. No se modifican tablas históricas de datos sísmicos, datasets ni experimentos ML.
