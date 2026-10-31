# Fase 8 — Histórico IGP: consulta por fecha y hora

**Cambio de interfaz**: `Historico IGP 1960–2025` ahora inicia sin tabla ni descarga. El usuario selecciona obligatoriamente fecha y hora UTC inicial y final y pulsa **Consultar sismos**. La tabla paginada, procedencia y exportaciones solo aparecen tras una consulta explícita correcta; al modificar un criterio se ocultan los resultados antiguos hasta volver a consultar. Se incluyen accesos rápidos para completar los años 2024 y 2025 (no ejecutan automáticamente consultas).

**Rangos exactos**: `start_at` y `end_at` son ISO-8601 con zona UTC. Se incluye todo el minuto final seleccionado. Las rutas `/api/v1/igp-history/events` y `/api/v1/igp-history/export` comparten los criterios de fecha y los filtros opcionales (magnitud, profundidad y zona). Se validan años 1960–2025, ambas fechas y rango ascendente. Los parámetros `year_from` y `year_to` existentes se conservan para compatibilidad con clientes anteriores.

**Exportación**: CSV/XLSX/PDF siguen protegidos por RBAC y generan registros auditados con criterios aplicados y hash de la fuente. La interfaz indica los límites conocidos: PDF 400 filas, CSV/XLSX 5000 filas; el backend puede imponer un límite inferior. Las descargas usan exactamente el período aplicado, no los cambios sin consultar.

**Datos y seguridad**: la fuente sigue siendo el snapshot XLSX oficial CENSIS 1960–2025 en `services/api/data/`. No se modifica Supabase, eventos de 2026, datasets, snapshots ML, experimentos, ni alertas. Los límites geográficos son rectangulares y podrían incluir países vecinos.

## Verificación

1. Terminal 1: `cd services/api && source .venv/Scripts/activate && python -m uvicorn app.main:app --reload --port 8000`.
2. Terminal 2: `cd apps/web && npm run build && npm run dev`.
3. Terminal 3: `cd services/api && source .venv/Scripts/activate && python -m pytest ../../tests/backend -q`.
4. Abrir `/historico-igp`: no debe aparecer una tabla ni solicitudes HTTP de `/igp-history/events` antes de pulsar **Consultar sismos**.
5. Elegir `01/01/2024 00:00 UTC` y `31/12/2024 23:59 UTC`; sin filtros adicionales, con el XLSX CENSIS utilizado por el proyecto deben aparecer **556** eventos.
6. Modificar las fechas: la tabla desaparece hasta repetir **Consultar sismos**. Cambiar de página solo debe consultar el período ya aplicado.
7. Exportar CSV y XLSX y comprobar que la fecha en los resultados está dentro del rango. El PDF de 556 filas está deshabilitado: acotar el período a un máximo de 400 registros y exportarlo.
8. Un usuario Solo lectura puede consultar, pero no exportar. Verificar la trazabilidad en Reportes y Auditoría con los demás roles.

