# Corrección de fechas IGP — consulta reciente

## Hallazgo

La API `GET /api/v1/igp/recent` mostraba un día adicional para algunos sismos ocurridos entre las 19:00 y las 23:59 (hora del Perú). La capa ArcGIS proporciona `fechaevento` en milisegundos UTC. El adaptador extraía el día en UTC y luego le agregaba `hora` (hora local de Perú). Así se desplazaba 24 horas el evento.

Ejemplos observados en el contraste aportado por el usuario:

| Reporte IGP | Hora oficial de Perú | UTC correcto |
| --- | --- | --- |
| 2026-0747, Andoas, Loreto | 2026-10-23 13:38:13 | 2026-10-23T18:38:13Z |
| 2026-0746, Limatambo, Cusco | 2026-10-22 23:25:24 | 2026-10-23T04:25:24Z |
| 2026-0745, Vitor, Arequipa | 2026-10-20 22:12:48 | 2026-10-21T03:12:48Z |
| 2026-0738, Quilca, Arequipa | 2026-10-16 23:28:10 | 2026-10-17T04:28:10Z |

## Corrección

- `services/api/app/igp/client.py`: convertir primero el instante ArcGIS UTC a `America/Lima`, extraer la **fecha local** y combinarla con el campo local `hora`. Mantener la respuesta de `occurred_at` en UTC.
- `tests/backend/test_igp_live.py`: probar fechas nocturnas y diurnas y comprobar que Andoas aparezca antes de Limatambo.
- No se modifican `latest`, React, PostgreSQL ni los datasets de ML.

## Verificación

Desde `services/api`, con el entorno virtual activo:

```bash
python -m pytest ../../tests/backend -q
python -m uvicorn app.main:app --reload --port 8000
```

Abrir `/api/v1/igp/recent` y comprobar el `occurred_at` del reporte `2026-0746`: `2026-10-23T04:25:24+00:00`. En el navegador la hora peruana debe mostrarse como **22/10/2026, 23:25:24**. El reporte `2026-0747` debe ser el primero de estos eventos.

Se validaron **41 pruebas automatizadas locales** con respuestas simuladas. Falta confirmar la respuesta en vivo del IGP en el entorno del usuario y el despliegue de Render.

## Notas operativas

- Si el servidor seguía activo con la respuesta anterior, reiniciarlo. La memoria caché en FastAPI conserva datos hasta 120 segundos por instancia.
- Para publicar el arreglo, hacer commit y push a `main` y validar Render. Vercel no necesita un nuevo build, ya que no cambia React.
- IGP y USGS siguen siendo fuentes separadas. El módulo de reportes IGP aún no persiste en Supabase, y esto no es una alerta temprana.
