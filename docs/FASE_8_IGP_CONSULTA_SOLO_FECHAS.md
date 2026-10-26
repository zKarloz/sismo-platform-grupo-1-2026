# Fase 8 — Histórico IGP: consulta por fechas y selector anual

## Cambio realizado

- El módulo **Histórico IGP 1960–2025** muestra inicialmente solo el formulario, sin tabla ni descargas automáticas.
- Se reemplazan `datetime-local` por **dos selectores de fecha** (`date`): inicio y fin, ambos inclusivos, etiquetados como UTC.
- Un selector numérico con flechas permite elegir cualquier año **1960–2025**. **Aplicar año** establece automáticamente `AAAA-01-01` y `AAAA-12-31` sin ejecutar la consulta.
- **Consultar sismos** es el único botón que ejecuta la primera búsqueda. Cambiar fechas, magnitud, profundidad o zona invalida los resultados anteriores; se deben volver a consultar antes de exportar.
- La API recibe `start_at=AAAA-MM-DDT00:00:00Z` y `end_at=AAAA-MM-DDT23:59:59.999999Z` para incluir **todo el último día**, incluso eventos de las 23:59:59 UTC. Esta elección no cambia la precisión almacenada en el catálogo.
- CSV, XLSX y PDF reutilizan exactamente el período aplicado en la consulta. Se conservan la paginación y los permisos RBAC; PDF permanece limitado a 400 filas y CSV/XLSX a 5.000 (o menos según configuración).

## Validaciones recomendadas

1. Abrir `/historico-igp` y comprobar que no se solicita `/api/v1/igp-history/events` hasta pulsar **Consultar sismos**.
2. Usar las flechas para seleccionar **2024** y pulsar **Aplicar año**. Las fechas deben ser `2024-01-01` y `2024-12-31`, sin horas visibles.
3. Pulsar **Consultar sismos** sin otros filtros; el XLSX CENSIS del proyecto contiene **556** registros de 2024.
4. Probar el intervalo `2024-07-01` a `2024-07-07`, cambiar después una fecha y comprobar que se oculta la tabla hasta una nueva consulta.
5. Exportar CSV y XLSX, verificar que no hay eventos fuera de las fechas. Para PDF, reducir los resultados a ≤400.
6. Verificar con rol **Solo lectura** que consultar funciona, pero exportar está restringido.
7. Ejecutar `npm run build` en `apps/web` y `python -m pytest ../../tests/backend -q` desde `services/api`.

**Alcance:** cambio de presentación y filtros enviados por React; sin migraciones SQL ni modificaciones de Supabase, eventos operativos 2026, XLSX original, datasets ML, auditoría o alertas. El backend sigue aceptando fechas/hora para compatibilidad con clientes anteriores.
