# Análisis histórico — Revisión 02: mes y departamento

## Alcance
- Agregados en el **Modal de filtros** del módulo Análisis histórico un selector `Mes específico (Perú)` de mes/año y un selector `Departamento indicado en el reporte`.
- El mes se convierte en un rango inclusivo de días civiles de Perú (UTC−05). Cuando se elige mes, los campos Desde/Hasta quedan inactivos; para usar un rango personalizado, se limpia el mes.
- Se reutiliza `FilterBar` mediante propiedades opcionales, sin activar los nuevos selectores en Dashboard y Mapa sísmico.
- El departamento se mantiene como estado local de Análisis histórico. Se incluye en resumen, gráfico seleccionado y exportación CSV mediante `reported_department`.
- `SeismicFilters` valida el código de departamento contra un catálogo cerrado y aplica coincidencia de **etiqueta final explícita** en `seismic_events.place` (`«... - Tumbes»` o `«..., Tumbes»`). También conserva el filtrado de fuente IGP/CENSIS.
- El lateral de filtros del Dashboard se reutiliza y muestra el departamento seleccionado y la limitación del criterio.

## Límite de calidad importante
No hay una columna departamental validada en el catálogo operativo. Este filtro **no representa fronteras administrativas ni una geocodificación exacta de epicentros**: considera solo descripciones que explicitan el departamento al final; excluye registros sin dicha etiqueta y puede reflejar el departamento de referencia de sismos mar adentro. Para filtrado espacial exacto haría falta integrar y probar límites administrativos en el backend con geometrías oficiales.

## Verificación
- 4 pruebas funcionales backend con SQLite: fecha/mes, coincidencia departamental, exclusión de USGS y rechazo de códigos arbitrarios.
- 9 pruebas estáticas frontend (4 nuevas + 5 regresión).
- Sintaxis TS/TSX y Python verificada. Ejecutar `npm run build` y la suite completa de backend en el proyecto local antes del despliegue.

## Despliegue
Publicar primero FastAPI (cambia `routes/filters.py`) y después el frontend. No requiere migración de Supabase ni modifica flujos SMTP.
