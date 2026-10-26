# Fase 8 — Reportes y administración

**Estado:** implementación y pruebas locales del backend completadas; pendiente de migración, compilación frontend y validación con Supabase/Vercel/Render por el equipo.

## Alcance implementado

- `Reportes`: cinco tipos (eventos, calidad/datasets, modelos, fuentes y alertas), formatos **CSV/XLSX/PDF**, fechas, fuente y zona rectangular para eventos/alertas, magnitud mínima, fecha de corte UTC y gráfico de distribución para PDF de eventos.
- El formulario de generación está en un **modal**. Historial paginado, tags de formatos y estado; descarga directa con autenticación (no se guardan archivos públicos).
- `report_exports` conserva solicitante, filtros, formato, corte UTC, cantidad, nombre de archivo, SHA256, tamaño, fecha de solicitud y caducidad administrativa. **No conserva el archivo** ni permite volver a descargarlo; guardar la copia local si la necesitas.
- Autorización en FastAPI: Administrador y Auditor todos los informes; Analista eventos, calidad, modelos y fuentes; Operador eventos, fuentes y alertas; Solo lectura sin exportaciones masivas.
- CSV antiguo `/analytics/export.csv` protegido y auditado, con las restricciones históricas de hasta 5000 filas y aviso `X-Export-Truncated`; se recomienda el nuevo generador si se necesita un informe sin truncar.
- Configuración controlada: límite de filas, retención de manifiestos y retención documental de auditoría. Cambios auditados, solo Administrador puede editar; Auditor puede consultar.
- `Usuarios y roles`: último acceso (cuando existe) y fecha de alta. El dato de MFA **no se inventa**: puede consultarse en Supabase Auth y su exposición administrativa necesitará otra integración segura.
- Auditoría protegida por trigger ante UPDATE/DELETE, exportación CSV de campos no sensibles y acción de exportación registrada.
- Retención de manifiestos vencidos: comando privado `python -m app.commands.prune_reports` para simulación o `--apply` para purga auditada. No elimina bitácoras ni datasets.

## Pasos en el proyecto

Desde la raíz, tras guardar cambios sin versionar:

```bash
unzip -o ~/Downloads/sismo-platform-parche-fase8-reportes-admin.zip -d .
```

En **Supabase → SQL Editor**, ejecutar `database/migrations/007_reports_admin.sql` y después `database/checks/009_verify_reports.sql`. Deben mostrar RLS activo en `report_exports`, `system_settings` y `audit_logs`.

En **terminal 1** (Backend):

```bash
cd services/api
source .venv/Scripts/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

En **terminal 2** (Frontend):

```bash
cd apps/web
npm run build
npm run dev
```

En **terminal 3** (Pruebas):

```bash
cd services/api
source .venv/Scripts/activate
python -m pytest ../../tests/backend -q
python -m app.commands.prune_reports
```

El comando de purga anterior es una **simulación**. No usar `--apply` hasta revisar la política de conservación con el equipo.

## Aceptación sugerida

1. Ingresar como Administrador y descargar eventos IGP de un intervalo pequeño en CSV, XLSX y PDF. Abrir los tres archivos y verificar fecha UTC, procedencia y filas. Repetir con USGS y comprobar que no se mezclan fuentes involuntariamente.
2. Descargar modelos: verificar que son **métricas históricas**, sin textos de predicción. En Calidad comprobar el resumen de calidad, versión y SHA del dataset inmutable.
3. Mostrar en Reportes el historial de la descarga anterior, su solicitante, fecha de corte y SHA256; compararlo con SHA256 local del archivo si se desea.
4. Iniciar sesión como Analista, Operador, Auditor y Solo lectura; comprobar la matriz RBAC tanto en botones como llamando al backend.
5. Actualizar `max_report_rows` en el modal de Configuración como Administrador y comprobar registro de auditoría. El Auditor solo consulta la configuración.
6. Exportar auditoría con una cuenta autorizada y verificar que la acción de exportación aparece en el historial; sin JSON de antes/después con secretos.
7. Comprobar que reportes con exceso de filas rechazan la descarga con HTTP 413 en lugar de recortar datos; que CSV viejo mantiene su bandera explícita de truncamiento.
8. `git add`, revisar `.env.example` y secretos, hacer commit, push; verificar Vercel y Render. El workflow IGP no se modifica.

## Límites de reproducibilidad

Los filtros, el corte UTC y el SHA permiten **identificar y comprobar el archivo descargado**. Para colecciones vivas, IGP/USGS pueden corregir reportes después del corte: consultar nuevamente no reproduce necesariamente los mismos bytes. Los **datasets versionados y snapshots** sí preservan su representación registrada. No llamar a los reportes vivos snapshots inmutables.

Ninguna operación de esta fase actualiza o reentrena `datasets`, `dataset_snapshots` ni `ml_experiments`.
