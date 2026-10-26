# Fase 8 — Corrección de exportaciones vacías y trazabilidad de filtros

## Diagnóstico con archivos reales

- El CSV de agosto de 2026 proporcionado por el usuario contiene **29 filas, todas USGS**.
- El PDF de agosto indica en el encabezado **Registros: 0**. El renderizador no perdió registros: el backend consultó cero resultados.
- El generador utiliza una única función SQL para CSV, XLSX y PDF; la diferencia se debe investigar comparando los **filtros efectivos** del historial, no los nombres libres de los informes.
- Una fuente IGP/CENSIS seleccionada para agosto puede devolver cero registros: el archivo histórico USGS no garantiza cobertura IGP equivalente.

## Cambios

1. Los reportes de cero filas devuelven HTTP **422** con mensaje explícito. No se registra una exportación vacía como generada; no altera históricos existentes.
2. El modal **no se cierra** tras una descarga: se puede cambiar CSV → PDF manteniendo idénticos fuente, fechas, magnitud y zona.
3. «Ver filtros aplicados» muestra en el historial los parámetros enviados realmente a FastAPI, incluida la zona horaria de Perú. Los filtros se leen de `report_exports.filters`.
4. Pruebas de paridad CSV/PDF y de protección contra informes vacíos.

## Verificar filtros históricos (Supabase SQL Editor)

```sql
SELECT report_name, file_format, row_count,
       filters->>'source' AS fuente,
       filters->>'start_at' AS desde_utc,
       filters->>'end_at' AS hasta_utc,
       filters->>'min_magnitude' AS magnitud_minima,
       filters->>'south' AS sur, filters->>'north' AS norte,
       filters->>'west' AS oeste, filters->>'east' AS este,
       cutoff_at AT TIME ZONE 'America/Lima' AS corte_peru
FROM public.report_exports
WHERE report_type = 'events' AND report_name ILIKE '%agosto%'
ORDER BY cutoff_at DESC;
```

**Importante:** si un CSV y PDF tienen filtros idénticos, deberían seleccionar las mismas filas salvo cambios de registros entre cortes. Ante discrepancias persistentes con filtros exactamente iguales, revisar versión de backend y actualizaciones entre cortes.

## Instalación y pruebas

Desde la raíz: `unzip -o sismo-platform-parche-fase8-filtros-reportes.zip -d .`.

- Terminal backend: `python -m pytest ../../tests/backend -q`.
- Terminal frontend: `npm run build && npm run dev`.
- En «Reportes», seleccionar fechas de agosto 2026 y **USGS**. Descargar CSV, cambiar el formato a PDF sin cerrar el modal y verificar 29 filas en ambos. No usar el nombre escrito como indicador de los filtros.
- Generar un informe sin coincidencias: debe mostrarse un mensaje, no descargarse un PDF vacío.
- No requiere migraciones; no modifica datasets, snapshots o ML.
