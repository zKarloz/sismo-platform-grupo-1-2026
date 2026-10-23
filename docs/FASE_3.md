# Fase 3 — Ingesta y catálogo de eventos

**Estado:** implementación preparada; ejecutar en tu entorno para verificar USGS y Supabase reales.

## Alcance (sin predicción)

- Conector inicial **USGS** sobre FDSN Event API, con filtros temporales, magnitud y bbox alrededor de Perú.
- Ventana móvil inicial: últimos 7 días, magnitud mínima 2.5, sin atribuir esos valores a una recomendación científica.
- Normalización: ID de USGS, origen UTC, latitud, longitud, magnitud/tipo, profundidad km, lugar, enlace y última revisión.
- Tabla `seismic_events`: escritura idempotente por `(source_id, external_id)`; revisión solo cuando USGS cambia `updated`.
- Historial `ingestion_runs` y estado de `data_sources`; fallos registrados si Supabase está disponible.
- API de solo lectura con paginación/filtros: `GET /api/v1/events`, `GET /api/v1/events/{id}`, `GET /api/v1/sources`.
- Frontend: módulos Eventos y Fuentes con datos **reales** provenientes de FastAPI, sin registros simulados.
- **Sin POST /sync:** no desplegar una acción administrativa sin autenticación. La ejecución actual es manual mediante CLI.

## Cómo ejecutar desde VS Code / Git Bash

Terminal 1 — backend (desde `services/api`):

```bash
source .venv/Scripts/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Terminal 2 — frontend (desde `apps/web`):

```bash
npm run dev
```

Terminal 3 — pruebas y sincronización (desde `services/api`):

```bash
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
python -m app.commands.sync_usgs --days 7 --min-magnitude 2.5
```

Comprobar:
- `http://127.0.0.1:8000/api/v1/sources` → USGS activo, último run en `success`.
- `http://127.0.0.1:8000/api/v1/events?page=1&page_size=20` → registros observados, magnitud y trazabilidad.
- `http://127.0.0.1:5173/eventos` → tabla paginada con filtros.
- `http://127.0.0.1:5173/fuentes-datos` → fecha, estado y métricas.
- Repetir CLI: si USGS no revisó los registros, `inserted=0` y `updated=0`.

## Consideraciones técnicas

- La zona es un **rectángulo de consulta** (lat -19.5 a 0.5, lon -84 a -68). Incluye áreas limítrofes y océano; **no** es la frontera política de Perú.
- Un 204 de USGS es una consulta válida sin resultados. 429/5xx reciben 2 reintentos; hay límite de páginas con error explícito por truncamiento.
- Los valores pueden ser revisados por USGS. Se mantiene la magnitud original con `magnitude_type` y la fecha de actualización de fuente.
- El procesamiento de evento se hace con valores reales y usa una transacción de escritura con bloqueo para prevenir carreras concurrentes.
- Si cambia el filtro de magnitud hacia abajo, registros previos siguen en la BD. No son eliminados automáticamente.
- El estado `active` expresa éxito del último conector, **no** una ingesta cada cinco minutos. Para programar en Render se necesitará un job autorizado independiente.
- RLS no reemplaza controles de backend; conexión PostgreSQL exclusivamente con secretos de servidor.
- Los fallos de conectividad a Supabase pueden impedir registrar el fallo en `ingestion_runs`.
- IGP queda para un conector posterior. No fusionamos registros USGS/IGP por proximidad automática.

## Pruebas / evidencia

- [ ] Pruebas de parser USGS y rutas en local.
- [ ] Primera ingesta USGS real con resultado registrado en Supabase.
- [ ] Segunda ingesta idempotente.
- [ ] Filtrado HTTP y frontend validado.
- [ ] Registrar evidencia (fecha, conteos, capturas) sin credenciales.

**Fase 3 completada únicamente cuando se verifiquen estos puntos en el entorno local.**

## Preparación de Render / Vercel

- En Render: `DATABASE_URL` secreta y `CORS_ORIGINS=https://tu-app.vercel.app`.
- En Vercel: `VITE_API_BASE_URL=https://tu-api.onrender.com` (sin `/api/v1`).
- Mantener el comando de ingesta fuera de rutas HTTP hasta crear autenticación,
  permisos y un job programado compatible con el servicio desplegado.
