# Fase 2 — Alta de usuarios desde la web (mejora UX)

**Estado:** parche implementado y probado en entorno aislado; **pendiente de validar en tu Supabase y en Vercel/Render**.

## Objetivo

La administración cotidiana de usuarios ocurre en «Usuarios y roles» sin usar SQL Editor ni ejecutar `link_identity` para cada integrante:

- **Modal «Nuevo usuario»:** nombre, correo, rol y modo «Invitación»; no ocupa espacio permanente en la pantalla.
- **Modal «Editar permisos»:** rol y estado; impide modificar la propia cuenta administrativa.
- **Tabla paginada desde PostgreSQL:** 10, 20 o 50 resultados, búsqueda por nombre/correo, filtros de rol/estado.
- **Etiquetas (tags):** rol, estado, identidad vinculada y marca de cuenta propia.
- **Auditoría legible:** acciones `identity.user.invited` y `identity.user.demo_created` con responsable y cuenta afectada.
- **Ruta `/establecer-clave`:** el invitado abre su correo, acepta la sesión verificada por Supabase Auth y crea su contraseña directamente en la aplicación.

Los cinco roles anteriores no cambian. Solo **Administrador** puede crear o editar; **Auditor** puede consultar. Todo endpoint mantiene la comprobación JWT + RBAC en FastAPI. No se modifica la ingesta IGP, los modelos, datasets ni los experimentos.

## 1. Instalación

Respaldar primero los cambios locales con Git, verificando que `.env` no se incluya. Descomprimir el ZIP desde la **raíz del monorepo**, conservando rutas.

No requiere migración adicional; reutiliza `public.users` y `public.audit_logs` y sus políticas RLS.

## 2. Configuración en FastAPI/Render

Añadir **solo al backend** (en el `.env` local ignorado por Git y en **Render → Environment**):

```dotenv
SUPABASE_SECRET_KEY=sb_secret_TU_CLAVE_PRIVADA
FRONTEND_PUBLIC_URL=https://TU-PROYECTO.vercel.app
ENVIRONMENT=production
ALLOW_DEMO_USER_CREATION=false
```

- Utiliza la clave **secret** de Supabase: *Settings → API Keys → Secret key*. Es una credencial privilegiada que **omite RLS**; exclusivamente en FastAPI/Render. Nunca en archivos públicos, variables `VITE_*`, Vercel, GitHub Actions, logs o capturas de pantalla.
- `SUPABASE_PUBLISHABLE_KEY` existente **no** permite administrar cuentas y **no sustituye** a `SUPABASE_SECRET_KEY`.
- `FRONTEND_PUBLIC_URL` debe ser el origen HTTPS exacto de Vercel, sin barra final. El backend construye el destino `/establecer-clave` sin aceptarlo del navegador.
- En Supabase **Authentication → URL Configuration → Redirect URLs** añadir `https://TU-PROYECTO.vercel.app/establecer-clave` y, para pruebas locales, `http://127.0.0.1:5173/establecer-clave`. Si no aparece el destino permitido, Supabase puede utilizar su Site URL por defecto.
- Verificar en **Authentication → Providers → Email** que estén habilitados los correos y que las invitaciones puedan enviarse. El correo de invitación es de **Supabase Auth**, distinto de `ALERT_SMTP_*` de la Fase 7. El envío predeterminado de Supabase puede tener cuotas reducidas; para un equipo mayor configurar SMTP transaccional del proyecto.
- El registro público de cuentas debe mantenerse deshabilitado: crear/invitar requiere rol Administrador.

Para trabajar localmente, además de tu `SUPABASE_URL`, puedes definir:

```dotenv
FRONTEND_PUBLIC_URL=http://127.0.0.1:5173
ENVIRONMENT=development
```

> El enlace que se genera desde Render llevará a Vercel. Para probar el enlace local, el **backend local** debe ser el que emite la invitación, con la URL local autorizada en Supabase.

## 3. Cuenta ficticia de demostración (opcional)

Solo en **desarrollo** y habilitándolo explícitamente en el backend:

```dotenv
ENVIRONMENT=development
ALLOW_DEMO_USER_CREATION=true
```

El modal habilita entonces «Cuenta ficticia»: correo que termina en `.test`, `.example` o `.invalid` y contraseña temporal de al menos 12 caracteres. Supabase Auth confirma ese correo artificial *solo* como cuenta de desarrollo. La contraseña no se guarda en `public.users` ni se escribe en `audit_logs`. **No activar en Render de producción.** No convierte el correo ficticio en buzón capaz de recibir invitaciones o avisos.

## 4. Flujo desde la aplicación

1. Entrar como **Administrador**, abrir **Usuarios y roles** y pulsar **Nuevo usuario**.
2. Completar el modal: nombre, correo real del compañero, rol inicial (recomendado Solo lectura), elegir **Invitación por correo** y enviar.
3. La identidad de Supabase Auth se crea y se vincula automáticamente a `public.users` con auditoría del Administrador.
4. El integrante abre el enlace de invitación (preferiblemente en una ventana privada, si el Administrador está autenticado en el mismo navegador). En `/establecer-clave` crea una contraseña.
5. Inicia sesión en `/login` y verifica sus permisos.
6. El Administrador puede modificar rol/estado desde el modal **Editar**, y todos los usuarios aparecen en tabla con paginación y filtros.

**Importante:** Supabase Auth y PostgreSQL son dos servicios distintos. Si la creación externa finaliza y la inserción de PostgreSQL falla, el backend intenta cancelar/eliminar únicamente la identidad recién creada; si la compensación también falla, informa error para que el equipo repare el vínculo de forma privada. No repetir invitaciones a ciegas.

## 5. Pruebas y despliegue

Terminal 1 (desde `services/api`):

```bash
source .venv/Scripts/activate
python -m uvicorn app.main:app --reload --port 8000
```

Terminal 2 (desde `apps/web`):

```bash
npm run build
npm run dev
```

Terminal 3 (desde `services/api`):

```bash
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
```

Comprobar: rol Auditor ve tabla pero no puede crear/editar; Administrador puede registrar; contraseña nunca se ve en logs/auditoría; búsqueda, páginas 10/20/50; filtros; modal Escape/clic fuera, tema claro/oscuro; invitación real y establecimiento de contraseña; auditoría. En producción revisar las variables de Render y la redirección Supabase antes de probar con compañeros.

**Validación aislada de este parche:** 83 tests backend, incluida regresión + nuevas pruebas. Transpilación sintáctica de 5 archivos TS/TSX sin errores. La compilación integral `npm run build` y los envíos reales de invitación están **pendientes en tu entorno**.

## 6. Límites y próximos pasos

- El alta de usuarios ya es web; las **preferencias personales de alertas por correo** van en un segundo parche, con consentimiento y umbrales por persona. No deben otorgar permisos operativos.
- La invitación puede expirar o ser bloqueada por cuota del SMTP de Supabase Auth. Un Administrador deberá comprobar el error y reenviar de forma controlada; este parche no ofrece aún botón «Reenviar invitación».
- Si se creó una identidad previamente en Supabase fuera de la plataforma, utilizar la vinculación CLI existente (no eliminar cuentas existentes ni compartir claves).
