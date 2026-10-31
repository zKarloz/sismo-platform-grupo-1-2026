# Integración IGP/CENSIS — Consulta de reportes publicados

Estado: **implementado para consulta; validación de red real y publicación pendientes**.

## Objetivo

Mostrar reportes publicados por el Instituto Geofísico del Perú (IGP/CENSIS) como fuente principal de **consulta reciente** del sistema, sin predicción de sismos ni suplantación de una alerta oficial.

## Servicios oficiales consultados

- `https://ide.igp.gob.pe/arcgis/rest/services/monitoreocensis/SismosReportados/MapServer/0/query`
- `https://ide.igp.gob.pe/arcgis/rest/services/monitoreocensis/UltimoSismo/MapServer/0/query`
- Página de contraste oficial: `https://ultimosismo.igp.gob.pe/productos/reportes-sismicos`

Son capas públicas ArcGIS REST, con soporte de consultas JSON. **La existencia de un endpoint público no acredita por sí sola permiso de redistribución comercial ni garantiza una frecuencia determinada**. Revisar términos aplicables y, si es necesario, solicitar confirmación al IGP antes de operar un servicio público permanente.

## Archivos incluidos

- `services/api/app/igp/client.py`: adaptador IGP, validación y normalización.
- `services/api/app/routes/igp.py`: GET `/api/v1/igp/recent` y GET `/api/v1/igp/latest`, respuestas cacheadas por 120 segundos.
- `services/api/app/main.py`: montaje del router.
- `apps/web/src/modules/eventos/IGPLivePanel.tsx`: vista del IGP con refresco periódico de 5 minutos y advertencias de retraso.
- `apps/web/src/modules/eventos/Page.tsx`: coloca la nueva vista antes del catálogo histórico almacenado.
- `tests/backend/test_igp_live.py`: pruebas deterministas sin llamar a la red real.

## Cómo probar en Git Bash

Terminal 1 (backend):

```bash
cd services/api
source .venv/Scripts/activate
python -m uvicorn app.main:app --reload --port 8000
```

Terminal 2 (frontend):

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

Abrir:

- `http://127.0.0.1:8000/api/v1/igp/recent`
- `http://127.0.0.1:8000/api/v1/igp/latest`
- `http://127.0.0.1:5173/eventos`

**Criterios para aceptar el conector:** respuesta `200`, `items` con hora UTC y fuente `IGP/CENSIS`, fechas visibles correctamente en hora Perú, coincidencia razonable con el portal oficial, aviso visible si la fecha publicada está retrasada. Un `503` puede indicar indisponibilidad o cambio de contrato IGP: revisar la consulta y **no inventar registros**.

## Límites y próximos pasos

- «Consulta periódica» no significa emisión instantánea. Depende de la publicación de IGP y de que el sitio esté abierto. No hay proceso de sincronización en segundo plano.
- Actualmente las consultas IGP **no se guardan en Supabase**; por tanto, dashboard, mapa y análisis históricos siguen basados en eventos USGS ya persistidos.
- El endpoint «Último Sismo» y «Sismos Reportados» son **capas independientes** y podrían mostrar fechas distintas.
- La fecha de consulta del servidor no es la fecha de publicación IGP, ni la fecha de origen del sismo.
- Antes de la Fase 7: validar condiciones de reutilización y regularidad del servicio, definir reconciliación IGP/USGS, normalizar y persistir eventos IGP con identificador estable y automatizar ingesta con un programador autorizado.
- Los datos de v1/v2 y los cinco experimentos ML permanecen intactos; no se vuelven a etiquetar ni entrenar.

## Pruebas de desarrollo

6 pruebas nuevas de adaptador y API verificadas localmente; 35 pruebas backend en total. **No se pudo verificar desde este entorno la respuesta real de las capas del IGP ni compilar React.** Pendiente de ejecución local.
