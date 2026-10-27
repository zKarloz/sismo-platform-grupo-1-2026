# Revisión Auditoría 01 — 26/10/2026

## Alcance aprobado

- Historial como tabla paginada desde PostgreSQL: **10 filas** inicialmente; selector **5/10/20**.
- Búsqueda por usuario, acción o entidad, filtros de categoría/resultado **a la derecha** del buscador y fechas civiles del Perú.
- Pestañas **Historial** y **Configuración**, sin repetir sus títulos dentro del panel.
- Vista de cambios antes/después y metadatos UTC, referencia de entidad y correlación; se ocultan claves sensibles de JSON al consultar.
- Exportar auditoría CSV desde Auditoría, reutilizando `/api/v1/admin/system/audit/export.csv`, respetando los mismos filtros; descarga autenticada, límite de 5.000 y registro de exportación.
- Retención documental mínima configurable (365–3650 días) solo para administrador; auditor en lectura. **No habilita purga automática**.
- Topbar dinámico por ruta: **Exploración / Módulo** o **Administración / Módulo**. Encabezado del módulo con título y subtítulo, sin fases ni versiones públicas.
- Tema oscuro carbón/azul petróleo; estados correcto/fallido/parcial se distinguen en verde/rojo/ámbar. No se alteran colores sísmicos del mapa.

## Seguridad y compatibilidad

- `GET /api/v1/admin/audit` incorpora `page`, `page_size`, `q`, `category`, `result`, `start_date` y `end_date`; mantiene compatibilidad con `limit`.
- `GET /api/v1/admin/system/audit/export.csv` añade los mismos filtros y preserva `start_at/end_at` existentes.
- Roles backend: solo `administrador`/`auditor` consultan o exportan; solo `administrador` modifica parámetros.
- No se registra IP, según la política vigente. `correlation_id` se presenta solo si fue facilitado.
- El esquema ya tiene `audit_logs`, `system_settings`, índices temporales y trigger de protección en las migraciones existentes. **Este parche no requiere nuevas migraciones ni borra datos**. Verificar que `007_reports_admin.sql` esté aplicada en la base desplegada.
- En Reportes permanecen sus exportaciones y configuración propias. La retención de auditoría se administra únicamente en Auditoría.

## Validación

Terminal backend, desde `services/api`:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

Terminal frontend, desde `apps/web`:

```bash
npm run build
npm run dev
```

Terminal de pruebas, desde la raíz (con el entorno Python del backend activo):

```bash
PYTHONPATH=services/api python -m pytest tests/backend/test_audit_review.py tests/backend/test_phase2_audit_labels.py tests/backend/test_phase8_reports.py -q
```

Comprobar manualmente perfiles administrador/auditor/solo lectura, fechas en Perú/UTC, filtros/exportación correspondientes, paginación >20, lectura/edición de retención, estados claro/oscuro y topbar en cada módulo. Tras subir a GitHub, desplegar **frontend Vercel y backend FastAPI**; no basta desplegar solo Vercel.

## Resultado de pruebas del paquete

- Pruebas unitarias de filtros sin conexión: **4 aprobadas**.
- Python: compilación sintáctica correcta en archivos modificados.
- TS/TSX: comprobación sintáctica correcta de archivos modificados.
- La suite de integración y el build Vite no pudieron ejecutarse sobre el ZIP parcial (faltan componentes, dependencias y módulos originales); deben validarse en el repositorio completo antes de subir a `main`.
