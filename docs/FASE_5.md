# Fase 5 — Calidad de datos y datasets versionados

**Estado:** implementación preparada y pruebas locales aprobadas; pendiente ejecutar migración 002 y verificar el primer snapshot en Supabase.

## Objetivo

Validar duplicados, nulos, límites técnicos y fechas inconsistentes de los **eventos sísmicos registrados**. Crear copias históricas inmutables de un subconjunto filtrado de `seismic_events` para experimentos **retrospectivos** de Machine Learning. **No predice terremotos.**

## Componentes

- `database/migrations/002_datasets_quality.sql`: `datasets` y `dataset_snapshots`, claves foráneas, unicidad por nombre+versión, RLS y triggers `BEFORE UPDATE OR DELETE` para impedir cambios de snapshots.
- `database/checks/002_verify_datasets.sql`: consultas de comprobación **solo lectura**.
- `GET /api/v1/data-quality/summary`: estadísticas completas de los eventos filtrados; los controles de integridad **no son** evaluaciones de riesgo sísmico.
- `GET /api/v1/datasets`: catálogo paginado de versiones guardadas.
- `GET /api/v1/datasets/{uuid}/quality`: reporte congelado al crear cada versión.
- `python -m app.commands.create_dataset`: única interfaz de escritura (Git Bash / servidor de confianza).
- `python -m app.commands.verify_dataset`: compara SHA-256 y conteo de filas congeladas.
- `/calidad-datos`: interfaz React, tema claro/oscuro y filtros analíticos de la Fase 4.

## Instalación y validación

1. Crear un respaldo o commit de tu proyecto actual antes de sobrescribir archivos con el parche.
2. Descomprimir el parche desde la raíz de `sismo-platform-v2`.
3. En **Supabase > SQL Editor**, ejecutar **una vez** `database/migrations/002_datasets_quality.sql`. No ejecutarlo desde React ni publicarlo en Vercel.
4. En otra consulta SQL, ejecutar `database/checks/002_verify_datasets.sql`: se esperan **2 tablas**, ambas con `rls_activo = true`, y **3 triggers** (`datasets_immutable`, `dataset_snapshots_immutable`, `dataset_snapshots_limit_position`).
5. Terminal 1 (backend; desde `services/api`):

   ```bash
   source .venv/Scripts/activate
   python -m uvicorn app.main:app --reload --port 8000
   ```

6. Terminal 2 (frontend; desde `apps/web`):

   ```bash
   npm run build
   npm run dev
   ```

7. Terminal 3 (pruebas; desde `services/api`):

   ```bash
   source .venv/Scripts/activate
   python -m pytest ../../tests/backend -q
   ```

8. Crear la **primera versión** con los eventos sincronizados (el nombre puede cambiar):

   ```bash
   python -m app.commands.create_dataset --name peru_usgs_historico --source USGS --min-magnitude 2.5 --max-rows 1000
   ```

   El comando imprime el UUID, la versión, el conteo y el SHA-256. Repetir el comando crea **v2** de forma explícita: **no elimina v1**. Nunca crea una muestra silenciosamente truncada: si el filtro coincide con más de `--max-rows`, fallará sin escribir nada y pedirá acotarlo. El máximo permitido es 5000 filas por versión (límite temporal del MVP).

9. Verificar el UUID de la versión creada (reemplazar el ejemplo):

   ```bash
   python -m app.commands.verify_dataset --id UUID_DE_TU_DATASET
   ```

   Esperado: `Conteo OK: True · SHA-256 OK: True`.

10. Visitar `http://127.0.0.1:8000/api/v1/data-quality/summary`, `http://127.0.0.1:8000/api/v1/datasets` y `http://127.0.0.1:5173/calidad-datos`. Si no ves el nuevo dataset en la pantalla, presiona **Actualizar**.

## Criterios de aceptación

- [ ] Migración 002 ejecutada en Supabase sin errores.
- [ ] Dos tablas, RLS y triggers verificados.
- [x] 21 pruebas backend superadas en entorno aislado (15 previas + 6 nuevas).
- [ ] `npm run build` exitoso en VS Code (pendiente verificación local).
- [ ] Primera versión guardada con conteo y SHA-256 correctos.
- [ ] Repetición genera una nueva versión, no modifica la anterior.
- [ ] Pantalla `/calidad-datos` visible en ambos temas, con datos reales.

## Reglas y límites

- No imputar valores faltantes. Profundidad/magnitud nulos se informan, no se inventan; una fila puede servir para otros análisis aunque no tenga ambas medidas.
- Rango técnico de comprobación: latitud [-90,90], longitud [-180,180], magnitud [-3,12], profundidad [-20,1000] km; se usa la integridad definida en la **migración 001**, **no un criterio físico universal**.
- Duplicados dentro de la **misma fuente** impedidos por `UNIQUE(source_id, external_id)`. Dos fuentes diferentes pueden informar el mismo sismo y ambas se preservan; la deduplicación entre proveedores queda pendiente.
- La calidad del snapshot conserva la fecha de corte, la fuente, los filtros, la firma SHA-256, el período y los campos de los eventos tal como estaban al momento de la captura. No se regeneran consultando USGS ni haciendo joins con `seismic_events`.
- Los triggers son una barrera de integridad, no una protección frente a un usuario PostgreSQL con privilegios de superusuario. No modificar tablas manualmente.
- La vía REST es **solo lectura** mientras no exista autenticación/RBAC (Fase 2 pendiente). No copiar `DATABASE_URL` al frontend.
- Con un conjunto de 35 eventos, el laboratorio ML podrá desarrollarse, pero sus conclusiones serán muy limitadas. **No asumir representatividad nacional.**
- Supabase y Render: no se requiere Docker en el flujo diario. Ejecutar migraciones en SQL Editor; trabajos de snapshot solo desde un entorno de backend confiable.

## Pendiente al cierre de Fase 5

Confirmar interfaz y base de datos reales en el equipo del desarrollador; una vez validado, actualizar este checklist y continuar a la Fase 6 (ML exploratorio, con evaluación y ausencia de predicción futura).
