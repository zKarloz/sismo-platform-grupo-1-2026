# Fase 8 · Histórico IGP 1960–2025 — Fuente XLSX CENSIS

## Estado

Integración implementada y verificada con XLSX real aportado por el equipo:
25 056 filas, 556 del año 2024 y 0 descartadas. Pendiente validar en
Render/Vercel y comprobar condiciones de distribución del archivo público.

## Decisión de arquitectura

- Fuente principal: XLSX descargado por el operador desde
  https://ultimosismo.igp.gob.pe/repositorio/datos-sismicos.
- Fuente secundaria: CSV versionado del portal de datos abiertos; después DKAN.
- Se valida el OOXML como datos, sin ejecutar macros ni fórmulas.
- SHA-256 del XLSX original y del catálogo normalizado; lectura caché 12 h.
- El número de fila del XLSX es una referencia **del snapshot**, no un código
  oficial CENSIS. Los enlaces llevan al repositorio, no a una ficha inventada.
- No se insertan datos históricos en `seismic_events`; no se tocan
  `datasets`, `dataset_snapshots`, `ml_experiments` ni el motor de alertas.
- El área del archivo es un rectángulo con potencial territorio de países
  vecinos; no representa exclusivamente sismos dentro de Perú.

## Instalación y pruebas

1. Desde la raíz del proyecto, guardar cambios pendientes y extraer el ZIP.
2. Comprobar que existe `services/api/data/igp_catalogo_1960_2025.xlsx`.
3. Terminal 3:
   ```bash
   cd services/api
   source .venv/Scripts/activate
   python -m app.commands.check_igp_history --year 2024 --refresh
   python -m pytest ../../tests/backend -q
   ```
   Se esperan 556 eventos para 2024, `source_mode=censis_xlsx_snapshot`.
4. Terminal 1: reiniciar FastAPI o dejar que `--reload` reconozca cambios de
   Python. No es necesario cambiar la base de datos.
5. Terminal 2: `npm run build` y `npm run dev`; abrir `/historico-igp`,
   seleccionar 2024 y verificar paginación y procedencia.
6. Exportar CSV y XLSX 2024 con rol autorizado; para PDF respetar el límite
   actual de 400 registros, por lo que conviene filtrar magnitud o zona.
7. Si el repositorio es público, revisar condiciones de redistribución de
   la fuente y mantener la atribución al IGP.

## Mantenimiento

El archivo no se actualiza automáticamente. Una nueva exportación del IGP
requiere reemplazar el XLSX, revisar conteos/huella y hacer un commit o
actualizar la ubicación privada del backend. La fecha `retrieved_at` indica
cuándo FastAPI leyó el archivo, **no cuándo fue publicado por el IGP**.

El histórico es consulta analítica retrospectiva; no origina alertas ni
predicciones sísmicas.
