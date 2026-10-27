# Revisión Reportes 01 — Paginación y tema oscuro

## Alcance

- `Reportes` reutiliza `components/ui/TablePagination.tsx` (existente): 5 registros por defecto y selector de 5, 10 o 20.
- `services/reports.ts` envía `page_size` al endpoint de historial; el backend existente ya pagina en PostgreSQL. Cambiar el tamaño reinicia a la primera página.
- Botón «Nuevo reporte» utiliza el mismo contraste que «Nuevo usuario» en modo oscuro, sin modificar colores globales.
- El detalle del manifiesto muestra fecha de generación y vencimiento de la retención, diferenciándolos de una URL de descarga (los archivos se entregan en memoria).
- CSV, XLSX y PDF dejan de mostrar «V2» al cliente mediante un cambio mínimo en el generador de informes.

## Verificaciones

```bash
cd apps/web && npm run build
# Desde la raíz:
node --test tests/frontend/reportes-paginacion-tema.test.cjs
PYTHONPATH=services/api python -m pytest tests/backend/test_phase8_reports.py -q
```

## Persistencia y despliegue

No se añaden tablas ni migraciones. Para activar la eliminación de «V2» en exportaciones, desplegar `services/api` además del frontend. La paginación y colores solo requieren el frontend.

## Pendiente para revisión funcional posterior

Validar en entorno real los formatos CSV/XLSX/PDF por rol, la procedencia de los datos y la aplicación de retención. Los PDF de eventos incluyen una gráfica; no se da por comprobada la presencia de gráficas para los demás tipos.
