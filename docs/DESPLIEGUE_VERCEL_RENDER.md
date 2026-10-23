# Despliegue inicial: Vercel + Render + Supabase

**Proyecto:** Sistema de Monitoreo Sísmico V2  
**Estado:** Pendiente de ejecutar y validar en las plataformas.  
**Propósito:** Publicar el frontend y el backend de lectura de sismos observados. No hay predicción sísmica ni sincronización automática por este despliegue.

## Paso A — Repositorio y preparación

Repositorio: `https://github.com/zKarloz/sismo-platform-grupo-1-2026`.

1. Confirmar que `.env`, `apps/web/.env.local` y credenciales no estén versionados.
2. Añadir `apps/web/vercel.json`. Su ubicación es deliberada: Vercel tendrá `apps/web` como directorio raíz del proyecto.
3. En Git Bash, desde la raíz del monorepo:

   ```bash
   git add apps/web/vercel.json docs/DESPLIEGUE_VERCEL_RENDER.md
   git commit -m "chore: configurar despliegue Vercel y documentar Render"
   git push origin main
   ```

## Paso B — Frontend en Vercel

1. Importar el repositorio desde **https://vercel.com/new**.
2. Configurar:

   | Ajuste           | Valor           |
   | ---------------- | --------------- |
   | Framework Preset | Vite            |
   | Root Directory   | `apps/web`      |
   | Build Command    | `npm run build` |
   | Output Directory | `dist`          |
   | Install Command  | `npm install`   |
   | Node.js          | `24.x`          |
   | Branch           | `main`          |

3. Ejecutar **Deploy**. Si todavía no existe el servicio de Render, el frontend se mostrará pero no podrá consultar datos: su fallback de desarrollo usa `http://127.0.0.1:8000`.
4. Guardar la **URL real** del proyecto Vercel (ejemplo ilustrativo: `https://tu-proyecto.vercel.app`).
5. Confirmar que `https://tu-proyecto.vercel.app/eventos` y `/mapa-sismico` cargan al abrir directamente o recargar: el rewrite en `vercel.json` habilita las rutas de React Router.

## Paso C — Backend en Render

1. Entrar a **https://dashboard.render.com/** → **New** → **Web Service** y conectar el mismo repositorio.
2. Configurar:

   | Ajuste             | Valor                                              |
   | ------------------ | -------------------------------------------------- |
   | Name               | `sismo-platform-api` (si está disponible)          |
   | Language / Runtime | Python 3                                           |
   | Branch             | `main`                                             |
   | Root Directory     | `services/api`                                     |
   | Build Command      | `pip install -r requirements.txt`                  |
   | Start Command      | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Health Check Path  | `/api/v1/health`                                   |
   | Compute            | Free, solo si sus limitaciones son aceptables      |

3. Variables de entorno en el Dashboard de Render (¡nunca en Git!):

   | Variable         | Valor                                                                                               |
   | ---------------- | --------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`   | URL real de Supabase **Session pooler**, con SQLAlchemy `postgresql+psycopg://` y `sslmode=require` |
   | `CORS_ORIGINS`   | **URL exacta de Vercel**, `https://...vercel.app`, sin barra final                                  |
   | `ENVIRONMENT`    | `production`                                                                                        |
   | `PYTHON_VERSION` | `3.12.12`                                                                                           |

   La URL debe provenir del diálogo **Connect → Session pooler** de Supabase: host y usuario varían por proyecto. No exponer esta variable en `VITE_` ni en el frontend.

4. Elegir **Deploy Web Service**.
5. Guardar la URL real de Render, que tendrá la forma `https://<nombre-del-servicio>.onrender.com`.
6. Validar:
   - `https://<render>/api/v1/health` → `status: ok`
   - `https://<render>/api/v1/db/health` → `status: ok`, `database: postgresql`
   - `https://<render>/api/v1/events` → respuesta con `items`, `total` y registros reales
   - `https://<render>/docs` → documentación OpenAPI

**Nota:** el health check de Render comprueba que FastAPI está vivo; el endpoint `/api/v1/db/health` comprueba por separado Supabase.

## Paso D — Enlazar Vercel con Render

1. Vercel → proyecto → **Settings → Environment Variables**.
2. Añadir `VITE_API_BASE_URL` = la **URL exacta de Render**, `https://<nombre-del-servicio>.onrender.com`, sin `/api/v1` ni barra final.
3. Seleccionar al menos **Production**. Si se necesitan previews, configurar el entorno Preview también.
4. Realizar **Redeploy** del frontend (las variables Vite se inyectan durante la compilación; los despliegues ya existentes no cambian).
5. Volver a comprobar en la URL real de Vercel: Dashboard, Eventos, Fuentes, Mapa, Análisis, Calidad y datasets, exportación CSV, cambio de tema y recarga directa de rutas.

## Validación y pendientes

- [ ] GitHub contiene `apps/web/vercel.json` y el documento, sin credenciales.
- [ ] Vercel compila y sirve React; rutas internas funcionan tras recarga.
- [ ] Render arranca y responde `/api/v1/health`.
- [ ] Render conecta con Supabase y responde `/api/v1/db/health`.
- [ ] Vercel consulta la API Render con CORS correcto.
- [ ] Dashboard, eventos, mapa, análisis, fuentes y calidad funcionan en el dominio público.
- [ ] Logs no contienen credenciales ni errores inesperados.

**Seguridad:** la API de lectura actualmente no incorpora autenticación completa ni control de acceso de la Fase 2. CORS restringe navegadores de otros orígenes, pero NO protege la API contra solicitudes directas. No publicar datos sensibles ni habilitar escrituras públicas hasta implementar permisos.

**Operación:** desplegar la API no programa el comando de ingesta USGS. La sincronización automática requiere un trabajo programado aparte; no debe ejecutarse como tarea periódica dentro de un servicio web Free de Render. Un servicio Free puede suspenderse después de 15 minutos sin tráfico; la primera consulta posterior puede tardar en responder.

**Documentación oficial:**

- Vercel Vite SPA: https://vercel.com/docs/frameworks/frontend/vite
- Vercel Root Directory: https://vercel.com/docs/builds/configure-a-build
- Render FastAPI: https://render.com/docs/deploy-fastapi
- Render Python Version: https://render.com/docs/python-version
- Supabase Postgres: https://supabase.com/docs/guides/database/connecting-to-postgres
