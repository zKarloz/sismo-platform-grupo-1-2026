# Fase 2 — Identidad, permisos y auditoría

**Proyecto:** Sistema de Monitoreo Sísmico V2 — Perú. **Estado:** implementación preparada; el cierre exige validación con usuarios reales en Supabase, Render y Vercel. No hay predicción de sismos.

## Alcance

- Inicio/cierre de sesión con **Supabase Auth** (correo y contraseña); Supabase gestiona las contraseñas y la renovación de sesión.
- FastAPI verifica tokens: claves asimétricas en `/.well-known/jwks.json`, firma, emisor, audiencia y caducidad; para proyectos antiguos HS256 pide a Supabase Auth la comprobación remota. No se descodifica JWT sin validar.
- **RBAC en base de datos**, nunca por el rol suministrado por el navegador. Roles: `administrador`, `analista`, `operador_alertas`, `auditor`, `solo_lectura`. Se exige cuenta vinculada por `auth_user_id` y `status='active'`.
- Acceso protegido al frontend y a operaciones administrativas. En `/usuarios-roles`, Administrador edita perfiles/estados; Auditor consulta. `/auditoria`: Administrador/Auditor. Creación y activación de reglas: Administrador. Aprobación/cancelación de avisos: Administrador/Operador. Simulación: Administrador/Analista/Operador. Usuarios de Solo lectura no pueden alterar nada.
- Auditoría: vínculo inicial por terminal, inicios de sesión, cambios de usuario/rol, creación/activación de reglas, aprobaciones y entregas. No registrar contraseñas, tokens, direcciones de destinatarios ni secretos.
- Los endpoints públicos observacionales existentes del IGP/USGS y las dos consultas reducidas de alertas continúan **públicos intencionalmente** por compatibilidad con Fases 3–7, y no incluyen emails ni contraseñas. La protección del navegador no sustituye al RBAC de la API.
- **No** se modifica `datasets`, `dataset_snapshots`, `ml_experiments`, ni los resultados de entrenamiento. GitHub Actions conserva `DATABASE_URL` privado y se ejecuta sin sesión interactiva.

## 1. Instalar código y migración

Desde la raíz del repositorio, **primero guarda los cambios actuales** mediante un commit de respaldo después de revisar que `.env` y otros secretos no estén en staging. Descomprime el parche conservando las rutas originales. La migración es aditiva.

En **Supabase SQL Editor** ejecutar, en este orden:

1. `database/migrations/005_identity_roles.sql`.
2. `database/checks/007_verify_identity.sql`.

Esto agrega `users.auth_user_id` (UUID, opcional y único) y conserva todas las filas anteriores. No asigna administradores automáticamente, ni toca migraciones 001–004.

## 2. Configuración: servidor y navegador

**Raíz `.env` local (FastAPI) / Environment de Render:**

```dotenv
# DATABASE_URL permanece igual (secreto privado PostgreSQL).
SUPABASE_URL=https://TU-REFERENCIA.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE_PUBLICA
```

**`apps/web/.env.local` local / Environment Variables de Vercel:**

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://TU-REFERENCIA.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE_PUBLICA
```

Para Vercel usa tu URL FastAPI desplegada, no `127.0.0.1` (p. ej. `https://sismo-platform-api.onrender.com`). La URL Supabase y **publishable key** son públicas por diseño. Si tu proyecto usa la clave `anon` heredada, puede usarse como API key pública mientras migras, **nunca** la `service_role` ni `sb_secret`. Mantener `DATABASE_URL` fuera del frontend. Establecer `CORS_ORIGINS` en Render con el origen exacto HTTPS de Vercel.

**Seguridad Supabase Auth:** en Authentication > Providers habilitar Email; mantener confirmación de correo; en la configuración general deshabilitar `Allow new users to sign up` y acceso anónimo para limitar las cuentas a administradores. Crear las cuentas mediante Authentication > Users; se pueden enviar invitaciones desde el Dashboard. Ajustar `Site URL` y Redirect URLs a Vercel cuando se utilicen enlaces de invitación/recuperación. Opcionalmente habilitar MFA en cuentas administrativas.

## 3. Vincular el primer usuario (procedimiento seguro)

La antigua cuenta `responsable@proyecto.local` es una **identidad declarada del CLI de Fase 7**, no un usuario de Supabase Auth. No uses ese correo ficticio para entrar a la web. Sigue estos pasos:

1. En **Supabase Dashboard → Authentication → Users**, crea/invita al administrador usando un **correo real** y completa confirmación/contraseña.
2. Copia el **User UID (UUID)** de esa cuenta, y verifica que el correo mostrado por Supabase es el mismo que se va a vincular.
3. Con la terminal privada en `services/api`, `.venv` activada y `DATABASE_URL` configurada, ejecuta:

```bash
python -m app.commands.link_identity \
  --auth-id UUID_REAL_DE_AUTH_USERS \
  --email TU_CORREO_REAL \
  --name "Administrador" \
  --role administrador
```

El enlace no se crea automáticamente por coincidencia de correo y está limitado a quien tenga las credenciales privadas de PostgreSQL. Este comando **no recibe contraseñas**. Para otras cuentas, repite el proceso con su respectivo UID y el rol menos privilegiado que necesiten.

El operador ficticio anterior seguirá apareciendo como **Sin vincular** en la lista hasta que decidas vincularlo a una cuenta real. No es necesario borrarlo ni cambiar las reglas existentes. La regla IGP ya activada no se modifica.

## 4. Tres terminales — verificación local

**Terminal 1 — FastAPI:**

```bash
cd services/api
source .venv/Scripts/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — React:**

```bash
cd apps/web
npm install
npm run build
npm run dev
```

`npm install` agrega `@supabase/supabase-js` y actualiza `package-lock.json`, que debe ser versionado junto con `package.json`. Si usas Vercel, configura también las tres variables `VITE_...` y redespliega.

**Terminal 3 — pruebas:**

```bash
cd services/api
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
```

Pruebas realizadas en entorno aislado: **64 aprobadas**. Incluyen JWT RSA genuinamente firmado (válido, expirado y audiencia incorrecta), validación HS256 remota simulada, bloqueo de cuentas no vinculadas, RBAC, autoescalada denegada y registro de auditoría. El frontend **no fue compilado aquí** porque no se pudo instalar npm; hay que validar `npm run build` localmente.

En el navegador abre `http://127.0.0.1:5173/login`, inicia sesión con tu cuenta real y comprueba el `/usuarios-roles`, `/auditoria`, `/alertas`. Las aprobaciones requieren que exista un aviso nuevo `pending`. Actualmente tener `inspected: 0` / `sent: 0` es normal hasta que un nuevo evento válido sea recibido después de la activación de la regla.

## 5. Despliegue y puesta en marcha

Confirma que `npm run build` y `pytest` pasan, y que la migración 005 se ejecutó antes de subir el nuevo backend. Luego revisa y sube los cambios con Git:

```bash
git status --short
git diff --check
git add services/api/app services/api/requirements.txt apps/web/src apps/web/package.json apps/web/package-lock.json apps/web/.env.example .env.example database/migrations/005_identity_roles.sql database/checks/007_verify_identity.sql tests/backend/test_phase2_identity.py docs/FASE_2_IDENTIDAD_PERMISOS.md
git diff --cached --check
git commit -m "feat: implementar login Supabase Auth RBAC y auditoria"
git push origin main
```

Si `package-lock.json` no existe antes de `npm install`, se generará localmente. No incluyas `.env` ni `.env.local`. Comprueba los logs de Render/Vercel y que GitHub Actions `igp-sync.yml` sigue verde; no precisa credenciales de usuario.

## 6. Límites y seguridad pendientes de endurecimiento

- El frontend guarda la sesión según el comportamiento predeterminado de supabase-js; evita scripts de terceros no confiables y aplica CSP/mitigación XSS antes de producción de alto riesgo.
- Acceso directo a tablas de Supabase continúa restringido por RLS. FastAPI usa el usuario DB privilegiado sólo del lado del servidor, por lo que **cada endpoint de escritura comprueba RBAC**.
- MFA puede configurarse en Supabase, pero el backend aún no exige un nivel MFA determinado (`aal2`) para acciones sensibles. Habilitar ese requisito antes de operación real crítica.
- El correo SMTP es opcional y permanece deshabilitado en el flujo automático. La cadencia gratuita de GitHub Actions no garantiza alertas inmediatas; nunca son alertas oficiales ni tempranas.
- Invitar / revocar credenciales de Auth se administra inicialmente en Supabase Dashboard; la UI gestiona roles y estado locales. El estado suspendido se aplica en FastAPI en cada petición protegida, aunque el proveedor pueda mantener una sesión aún válida para otros servicios.
- Los endpoints públicos de información sísmica siguen públicos por decisión arquitectónica: **login protege la aplicación React y las operaciones administrativas**, no convierte en privados todos los datos sísmicos públicos.
