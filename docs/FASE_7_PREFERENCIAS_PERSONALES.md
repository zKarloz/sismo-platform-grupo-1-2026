# Fase 7 · Mis notificaciones (ampliación opt-in)

## Comportamiento

- Menú de perfil y navegación → **Mis notificaciones**. Para cualquiera de los cinco roles, incluido Solo lectura.
- Preferencia **desactivada por defecto**. Modal para activar/desactivar y elegir magnitud mínima **M2.0–M9.0** (décimas). Fuente inicial únicamente **IGP/CENSIS**; no confundir M con nivel oficial de peligro.
- Solo se utiliza el correo registrado en la cuenta autenticada. No se pueden elegir otros destinatarios desde esta pantalla. Se deshabilita el alta para dominios reservados (`.test`, etc.); usar una dirección real. El correo debe estar controlado por su titular; crear usuarios por invitación es lo recomendado.
- El servidor deduce `user_id` desde JWT Supabase Auth y RBAC, sin aceptar IDs proporcionados por el navegador. Estado y magnitud pueden cambiarse sin permisos de Administrador porque son **personales**. No modifican las reglas globales.
- Al activar/cambiar el umbral, se reinicia `activated_at` y se cancelan envíos pendientes o fallidos de la configuración antigua. Los mensajes marcados `sending` ya reclamados pueden estar en tránsito; no es posible retirar un correo aceptado por un proveedor externo.
- La evaluación solo crea notificaciones para IGP con magnitud suficiente, recibidos **después de la activación**, cuya ocurrencia está dentro de las últimas 24 h (y no más de 5 min en el futuro). Deduplicación por `(user_id, event_id)`. No son alertas tempranas ni predicciones.
- Historial paginado de 10, 20 y 50 registros, separado de `alert_deliveries` global. `sent` indica **aceptado por SMTP**, no lectura garantizada.
- SMTP requiere habilitación administrativa. El navegador **no** registra contraseñas SMTP. Máximo 3 intentos por mensaje, espera progresiva; el estado `sending` que quede tras un fallo del proceso requiere revisión manual para evitar reenvíos inciertos.

## Instalación

1. Guardar cambios pendientes, extraer ZIP en la raíz del repositorio.
2. Ejecutar **`database/migrations/006_personal_notifications.sql`** en Supabase SQL Editor; luego **`database/checks/008_verify_personal_notifications.sql`** y comprobar RLS `true` en las dos tablas.
3. En tres terminales: FastAPI (`uvicorn app.main:app --reload --port 8000`), Vite (`npm run build && npm run dev`) y pruebas (`python -m pytest ../../tests/backend -q`).
4. Entrar con cuenta propia de cualquier rol → **Mis notificaciones**. Comprobar estado inicial apagado, modal, magnitud, guardar, auditoría y tabla vacía paginada. Probar Solo lectura, otro usuario y cuentas `.test`.
5. Publicar cambios en GitHub. Vercel despliega el frontend y Render el backend; antes debe existir la migración 006. El workflow programado evaluará la cola después de ingestar IGP.

## Primeras pruebas sin correo automático

En terminal 3 (`services/api`, `.venv` activo, `DATABASE_URL` privado):

```bash
python -m app.commands.personal_notifications evaluate
python -m app.commands.personal_notifications dispatch
```

El segundo comando, **sin** `--send-email`, no envía nada. Se requiere nuevo reporte IGP posterior a la activación y M >= umbral para crear una entrega.

## Habilitar envío automático desde GitHub Actions (opcional)

La ingesta sigue ejecutándose **cada hora**, sin garantía de puntualidad. En GitHub → Settings → Secrets and variables → Actions configura:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `DATABASE_URL` | Ya existente, conexión PostgreSQL privada |
| Secret | `ALERT_SMTP_HOST` | `smtp.gmail.com` |
| Secret | `ALERT_SMTP_FROM` | Cuenta remitente Gmail del proyecto |
| Secret | `ALERT_SMTP_USER` | Cuenta remitente Gmail del proyecto |
| Secret | `ALERT_SMTP_PASSWORD` | Contraseña de aplicación de Google, **nunca** contraseña habitual |
| Variable | `ALERT_SMTP_PORT` | `465` (predeterminado si se omite) |
| Variable | `ENABLE_PERSONAL_EMAIL` | `true` **solo después de validar y decidir activar envíos** |

No colocar los secretos en el repositorio público, Vercel, variables `VITE_*` ni respuestas de API. Protege la rama `main` y las autorizaciones de edición de workflows: cualquiera con permiso para modificar flujos automatizados puede comprometer secretos del repositorio. Preferir una cuenta remitente dedicada al proyecto.

Para pruebas manuales privadas con Gmail ya configurado en Git Bash:

```bash
python -m app.commands.personal_notifications dispatch --send-email
```

Este comando puede enviar **a todos los suscritos con correos pendientes elegibles**, no solo a quien lo ejecuta. El flujo automatizado también evaluará las reglas operativas globales por separado; sus correos continúan sujetos a aprobación humana y otro comando privado.

## Validación y límites

Pruebas unitarias del motor cubren opt-in, permisos, deduplicación, no retroactividad, desactivación, reintentos y ausencia de secretos en error. No se realizaron envíos de correos reales ni pruebas contra Supabase del usuario en el entorno de preparación. Si SMTP acepta un mensaje pero falla la red, puede existir una entrega duplicada si alguien la reintenta manualmente; por eso `sending` se bloquea hasta revisión privada.

**Documentación breve:** No se modifican `datasets`, `dataset_snapshots` ni `ml_experiments`; las notificaciones solo responden a eventos sísmicos publicados y almacenados.
