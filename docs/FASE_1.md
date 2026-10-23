<!-- Seguimiento breve, basado en resultados y sin declarar verificaciones locales no ejecutadas. -->

# Fase 1 - Base técnica y diseño UX

**Estado:** estructura y código base preparados; **pendiente comprobar ejecución en el equipo local**.

## Alcance implementado en el paquete

- Monorepo organizado según sección 5 del plan original; diez carpetas de módulos web.
- Frontend React + TypeScript + Vite + Tailwind CSS v4 + Lucide React con sidebar responsive, rutas iniciales y tema claro/oscuro opcional persistido en el navegador.
- Backend FastAPI con OpenAPI, CORS local y endpoints `/api/v1/health` y `/api/v1/db/health`.
- PostgreSQL 17 mediante Docker Compose (puerto local 5433) y configuración de entorno de ejemplo.
- Pruebas automatizadas iniciales de la API, CI básico con GitHub Actions, roles definidos (sin permisos activos todavía), archivos README y exclusión de secretos mediante `.gitignore`.

## Comprobaciones para cerrar esta fase

- [ ] `npm install` y `npm run build` completados en `apps/web`.
- [ ] `npm run dev` muestra navegación responsive en `http://localhost:5173`.
- [ ] Alternar Sol/Luna en la barra superior cambia todas las pantallas; el tema elegido se conserva al recargar.
- [ ] `python -m pytest ../../tests/backend -q` pasa en `services/api`.
- [ ] API `/api/v1/health` responde con `status: ok`.
- [ ] `docker compose up -d db` deja a PostgreSQL saludable.
- [ ] API `/api/v1/db/health` responde `status: ok` con la base activa.
- [ ] Iniciar repositorio Git y hacer primer commit después de validar.

## Siguientes decisiones

Las entidades y migraciones Alembic, la autenticación, los roles y la auditoría corresponden a fases posteriores y no se consideran terminados aquí. No activar salidas ML predictivas ni canales públicos de alertas.

## Convención de terminales

1. Terminal backend: FastAPI.
2. Terminal frontend: Vite.
3. Terminal pruebas: pytest, builds, verificaciones y Docker Compose.

**Prueba científica:** ninguna, porque la base aún no ingiere ni analiza eventos; el sistema está identificado como informativo/no oficial.

# Sistema de tema semántico

**Estado:** implementación preparada; validación local pendiente.

## Cambio realizado

- `apps/web/src/index.css`: variables de diseño por tema en `:root` / `:root.dark`, expuestas a Tailwind CSS v4 con `@theme inline`.
- Componentes `AppLayout`, `StatCard`, `ModulePlaceholder`, `DashboardPage` y `router`: cambio de utilidades visuales a clases semánticas (`bg-page`, `bg-panel`, `text-main`, `border-border-ui`, etc.).
- Colores del modo oscuro en escala de grises neutros. El tema claro conserva azul marino y cyan.
- `useTheme.ts` permanece sin cambios: persiste preferencia Sol/Luna.
- Estados de API verde y rojo intencionalmente fuera de la paleta neutra.

## Verificaciones pendientes

- [ ] `cd apps/web && npm run build` completa sin errores.
- [ ] El modo oscuro cambia superficies, textos, sidebar y banner a grises neutros.
- [ ] El modo claro conserva buena legibilidad y la identidad azul marino/cyan.
- [ ] La elección del usuario se conserva al recargar.
- [ ] Navegación y pantalla 404 son legibles en ambos temas.

## Mantenimiento futuro

Cambiar los valores `--ui-*` en `apps/web/src/index.css` sin editar cada componente. Para nuevas pantallas usar tokens semánticos y reservar colores explícitos para estados operativos (éxito, error, advertencia).

# Esquema inicial de PostgreSQL en Supabase

**Estado:** migración preparada; ejecución en Supabase **pendiente** hasta confirmación local.

## Decisiones de alcance

- PostgreSQL administrado en **Supabase**. El frontend de Vercel llama únicamente a FastAPI (Render); no accede directamente a la base de datos.
- Se almacenan **eventos observados sincronizados**, no todo el catálogo mundial o histórico.
- Se crean **7 tablas**: `users`, `data_sources`, `ingestion_runs`, `seismic_events`, `alert_rules`, `alerts`, `audit_logs`.
- `users` registra perfiles y un rol principal provisional; **no implementa inicio de sesión ni guarda contraseñas**. Autenticación y autorización real corresponden a otra etapa.
- Cada sismo conserva `source_id + external_id` como clave de deduplicación **dentro de cada proveedor**. No se deduplican proveedores distintos automáticamente.
- No se guardan predicciones ni se generan alertas oficiales; `alerts` exige un evento existente y las reglas inician desactivadas.
- Las tablas de ML, datasets, reportes y entregas de alertas se crearán cuando corresponda implementarlas.

## Cómo ejecutar (rápido, sin Docker)

1. Abre **Supabase → tu proyecto → SQL Editor → New query**.
2. Pega el contenido de `database/migrations/001_initial_schema.sql` y pulsa **Run** **una vez**. Usa una BD nueva o revisa los nombres antes si ya tienes tablas.
3. Abre una segunda consulta y pega `database/checks/001_verify_schema.sql`; pulsa **Run**.
4. Comprueba **7 filas** en la lista de tablas, **7 `rls_enabled=true`**, el aviso `OK` de la prueba relacional y `test_rows_remaining=0`.
5. En Git Bash, desde `services/api`, inicia FastAPI y visita `/api/v1/db/health`; debe responder `status: ok` si la URL de conexión es válida. **Este endpoint solo valida conectividad, no la estructura de tablas.**
6. Guarda en `docs/FASE_1.md` la fecha de ejecución, resultado y los errores corregidos. No pegues credenciales ni logs que las incluyan.

## Seguridad y límites

- La migración activa **RLS** sin políticas de acceso a clientes y revoca privilegios de `anon` y `authenticated` en las siete tablas. Esto no bloquea al propietario de la BD ni reemplaza controles de autorización en FastAPI.
- Supabase **Data API desactivada**: no se usarán `supabase-js` ni consultas del navegador a PostgreSQL.
- `DATABASE_URL` permanecerá en `.env` local y como variable secreta de Render, nunca en Git o variables públicas `VITE_*`.
- Para producción, crear un **rol PostgreSQL de aplicación con privilegios mínimos** y auditar qué accesos están permitidos; mientras se pruebe con el usuario administrativo de conexión, mantener el acceso solo en backend.
- Los campos `updated_at` deben actualizarse desde los servicios de FastAPI al editar registros.
- `zone_spec` es una estructura JSON que el backend deberá validar; la base de datos solo garantiza que sea un objeto. No implica por sí sola una delimitación geográfica correcta.
- `review_status`, `magnitude_type` y la equivalencia entre magnitudes de proveedores requieren validación de significado científico. No se compararán indiscriminadamente escalas distintas.
- La prueba de escritura utiliza identificadores y URLs **ficticios temporales** dentro de una transacción `ROLLBACK`, y no deja registros en la BD.

## Próximo paso

Implementar los modelos SQLAlchemy y los endpoints `GET /api/v1/sources`, `GET /api/v1/events` e ingesta USGS con upsert de `(source_id, external_id)`; después, dashboard y mapa con datos reales.
