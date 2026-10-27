# Revisión Auditoría 02 — Correcciones de compilación y tema

- **React/TypeScript:** retirados `useAuth` y `profile` no utilizados de `auditoria/Page.tsx` para solucionar TS6133.
- **FastAPI:** `page_size` pasa de `Literal[5, 10, 20]` a `int` con validación explícita; los valores `5`, `10` y `20` funcionan en query string, y valores distintos se rechazan con 422. Predeterminado: 10.
- **Tema oscuro:** restaurados exactamente los tokens globales de negro/gris previos a la revisión 01 (`index.css`). Los estados en la vista de Auditoría conservan estilos verde, rojo y ámbar tanto en claro como en oscuro.
- **Regresión:** se añaden casos para los tres tamaños de página en `test_phase2_audit_labels.py`.
- **Sin migraciones SQL ni modificaciones al contrato de exportaciones o reportes.**

## Validación desde el proyecto

```bash
# Terminal 2: apps/web
npm run build

# Terminal 3: raíz del repositorio (con entorno del backend activo)
PYTHONPATH=services/api python -m pytest tests/backend/test_audit_review.py tests/backend/test_phase2_audit_labels.py tests/backend/test_phase8_reports.py -q
```

Las pruebas completas y el build deben verificarse en el repositorio completo; el ZIP correctivo incluye solo cinco archivos.
