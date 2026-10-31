# Fase 4 — Dashboard, mapa y análisis estadístico

**Sistema de Monitoreo Sísmico V2** · React + FastAPI + Supabase

**Estado:** implementación preparada; validación en el equipo del desarrollador pendiente.

## Alcance implementado

- `GET /api/v1/dashboard/summary`: conteo, magnitud máxima, profundidad promedio, cantidad de datos disponibles y último evento, calculados en PostgreSQL sobre el conjunto filtrado.
- `GET /api/v1/analytics/timeseries?interval=day|month`: agrupaciones cronológicas (UTC).
- `GET /api/v1/analytics/magnitudes`: histograma con rangos de magnitud y nulos.
- `GET /api/v1/analytics/depth-vs-magnitude?limit=500`: dispersión de **hasta 500 registros recientes** con ambas medidas, indicando truncamiento.
- `GET /api/v1/events/geojson?limit=1000`: marcadores GeoJSON de **hasta 1000 eventos recientes**, indicando truncamiento.
- `GET /api/v1/analytics/export.csv`: exportación UTF-8 de hasta 5000 registros filtrados, con sanitización básica frente a fórmulas CSV.
- Dashboard React con cuatro KPI, serie temporal e histograma.
- Mapa interactivo Leaflet con OpenStreetMap, marcadores por magnitud, fichas y origen externo.
- Análisis con serie diaria/mensual, distribución y diagrama de dispersión.
- Filtros globales por fechas UTC, magnitud, profundidad y fuente, preservados al navegar entre las tres pantallas mediante `AnalyticsProvider`.
- Colores claro/oscuro conservados a través de tokens CSS semánticos.

## Instalación

Aplicar el ZIP desde la raíz del repositorio (proteger modificaciones locales):

```bash
unzip -o ~/Downloads/sismo-platform-parche-fase4.zip -d .
```

**Terminal 1 (FastAPI):**

```bash
cd services/api
source .venv/Scripts/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 (React):**

```bash
cd apps/web
npm install
npm run build
npm run dev
```

**Terminal 3 (pruebas e ingesta):**

```bash
cd services/api
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
# Para visualizar más eventos existentes (datos reales):
python -m app.commands.sync_usgs --days 60 --min-magnitude 2.5
```

La ingesta de 60 días no es obligatoria si la API ya tiene suficiente información; puede tardar más o depender de la disponibilidad de USGS. El filtro geográfico de la fuente cubre un **rectángulo que incluye Perú y parte de países vecinos**, no un polígono administrativo exacto.

## Verificación

- API de estadísticas: <http://127.0.0.1:8000/api/v1/dashboard/summary>
- API temporal: <http://127.0.0.1:8000/api/v1/analytics/timeseries?interval=day>
- API de mapa: <http://127.0.0.1:8000/api/v1/events/geojson>
- Frontend: `http://127.0.0.1:5173/` → `/mapa-sismico` → `/analisis`.
- Cambiar fechas/fuente/magnitud en el dashboard, luego abrir el mapa: filtros preservados.
- Comparar recuentos de KPIs e histogramas con los mismos filtros.
- Inspeccionar los datos en Supabase sin que el frontend tenga credenciales de PostgreSQL.
- Verificar visualmente temas claro y oscuro en las tres páginas.
- Probar exportación CSV y procedencia de eventos.

En el entorno de preparación: **15 pruebas backend superadas (SQLite aislado y dobles de API)**. La instalación npm y la compilación frontend no pudieron verificarse aquí debido a falta de conectividad hacia npm. **No se ha ejecutado una ingesta remota ni escrito en la BD del usuario.**

## Límites / decisiones explícitas

1. Las métricas solo representan **eventos sincronizados**, no todo el catálogo peruano y no son pronósticos ni estimaciones de riesgo.
2. Las agrupaciones diarias son por fecha registrada en PostgreSQL; desplegar PostgreSQL con zona horaria de sesión UTC (configuración habitual de Supabase).
3. El mapa y la dispersión muestran una selección de eventos **más recientes** con límite, claramente etiquetada. No se trata de una muestra estadística aleatoria.
4. Los tamaños de marcadores indican magnitud de forma ilustrativa; **no** representan impacto, daños ni niveles oficiales de peligro.
5. No existe columna de región administrativa normalizada en `seismic_events`. No se inventan conteos por departamento ni polígonos; se incorporarán cuando haya georreferenciación validada.
6. Los gráficos de magnitud mezclan tipos reportados (`mb`, `mwr`, etc.) sin normalizar; interpretar con cautela hasta validación con especialista.
7. La cartografía usa las teselas públicas de OpenStreetMap en modo interactivo ordinario, con atribución visible. Para tráfico productivo significativo, contratar proveedor compatible con su política de uso.
8. Los endpoints de lectura continúan públicos en entorno de desarrollo; proteger los datos administrativos y aplicar rate limiting antes del despliegue definitivo.
9. La ingesta programada y la validación científica siguen pendientes de fases posteriores, no son parte de esta entrega.

## Archivos modificados/agregados

- `services/api/app/main.py`
- `services/api/app/routes/{filters,analytics,geo,exports}.py`
- `apps/web/package.json`, `apps/web/src/app/AppLayout.tsx`, `apps/web/src/index.css`
- `apps/web/src/types/analytics.ts`, `apps/web/src/services/analytics.ts`, `apps/web/src/hooks/useAnalyticsFilters.tsx`
- `apps/web/src/components/analytics/{Charts,FilterBar}.tsx`
- `apps/web/src/modules/{dashboard/DashboardPage,mapa-sismico/Page,analisis/Page}.tsx`
- `tests/backend/test_analytics_api.py`

**No hay nuevas migraciones SQL**: se utilizan `seismic_events`, `data_sources` e `ingestion_runs` creadas en la Fase 1.
