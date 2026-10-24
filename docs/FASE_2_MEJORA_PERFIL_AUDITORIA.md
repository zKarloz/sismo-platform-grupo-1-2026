# Mejora de Fase 2 — Perfil desplegable y auditoría legible

## Alcance

- El encabezado muestra el icono `UserRound` y únicamente el nombre. Al pulsar, el menú ofrece el rol actual, correo y cierre de sesión. Usa bordes `rounded-lg`, funciona en móvil y admite Escape/clic exterior.
- El endpoint protegido `GET /api/v1/admin/audit` mantiene sus campos actuales e incorpora `actor_name`, `actor_role` y `subject_name` mediante `LEFT JOIN` con `public.users`.
- La vista Auditoría presenta nombres, roles legibles, acciones en español, hora de Perú y cambios explicados con lenguaje claro. Los UUID y JSON siguen disponibles únicamente al expandir «Ver detalles técnicos».
- Los registros automáticos sin `actor_id` aparecen como «Sistema automatizado» en vez de atribuirse falsamente a una persona.
- El rol mostrado en registros antiguos es el **rol actual** del usuario, no necesariamente el que tenía al producirse el evento (la tabla actual no guarda una instantánea temporal del rol).

## Seguridad y compatibilidad

- **No se aplica ninguna migración SQL** ni se modifican las tablas, los datasets, los experimentos de ML o la ingesta IGP.
- RBAC permanece intacto: `/api/v1/admin/audit` solo permite `administrador` y `auditor`. La barra lateral oculta navegación según rol, pero el backend realiza el control real.
- No se envían credenciales ni información privada adicional a usuarios sin permisos.
- La API conserva IDs y JSON originales para investigación técnica, sin exponerlos inicialmente en la interfaz.

## Archivos

1. `apps/web/src/app/AppLayout.tsx`
2. `apps/web/src/modules/auditoria/Page.tsx`
3. `apps/web/src/lib/roleLabels.ts` (nuevo)
4. `services/api/app/routes/identity.py`
5. `tests/backend/test_phase2_audit_labels.py` (nuevo)
6. `docs/FASE_2_MEJORA_PERFIL_AUDITORIA.md` (este documento)

## Verificación

Desde las tres terminales habituales:

```bash
# Terminal 1 — FastAPI
cd services/api
source .venv/Scripts/activate
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — React
cd apps/web
npm run build
npm run dev

# Terminal 3 — Tests
cd services/api
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
```

Comprobar: abrir/cerrar el perfil, Escape, cambio de tema, login/logout; en Auditoría verificar nombre del operador, rol, acción traducida, usuario afectado y detalles técnicos plegados. Confirmar que un usuario de solo lectura no accede a `/api/v1/admin/audit`.

## Pruebas del parche

Dos pruebas aisladas del endpoint de auditoría pasan en SQLite; transpilation sintáctica TypeScript/TSX de los tres archivos nuevos/modificados pasa. Compilación React completa y suite global deben ejecutarse en el repositorio local del proyecto.
