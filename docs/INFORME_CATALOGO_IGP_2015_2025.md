# Informe de diagnóstico del catálogo histórico IGP 1960–2025

> **Alcance:** auditoría descriptiva del archivo Excel aportado al proyecto. No es entrenamiento ML ni verificación independiente del origen editorial del archivo.

## Fuente auditada

- Archivo: `igp_catalogo_1960_2025.xlsx`.
- Hoja: `IGP - Datos sísmicos`.
- Campos observados: fecha UTC, hora UTC, latitud (º), longitud (º), profundidad (km), magnitud (M).
- SHA-256 del archivo: `51e75ba1032cef71adfbb780626c33f52fed8a430c12221271dfaed62ade09ca`.
- Filas de datos: **25.056**, desde 1960 hasta 2025.
- Registros en 2015–2025: **7.636**.

## Auditoría estructural y de valores

- Las seis columnas están completas en los 25.056 registros: sin celdas ausentes ni fechas u horas no interpretables.
- No se encontraron coordenadas fuera de latitud [-90, 90] o longitud [-180, 180], ni profundidades negativas.
- No se encontraron duplicados exactos de las seis columnas ni repeticiones de fecha + hora + latitud + longitud. Esta comprobación no descarta duplicados de un evento con valores corregidos.
- Magnitud del catálogo: **M 3,0–8,4**; profundidad: **5–743 km**.
- El archivo no contiene identificador oficial por evento, tipo/escala de magnitud, departamento, URL individual de reporte, fecha de actualización ni una columna de procedencia por fila.
- La integridad de este archivo queda identificada por SHA-256; la autenticidad de origen debe verificarse contra el procedimiento/documentación de obtención del catálogo.

## Conteos anuales 2015–2025

| Año | Todos | M ≥ 4,0 | M ≥ 4,5 | M ≥ 5,0 | M mínima | Profundos (>300 km) |
|---|---:|---:|---:|---:|---:|---:|
| 2015 | 814 | 814 | 795 | 124 | 4.0 | 26 |
| 2016 | 946 | 946 | 942 | 147 | 4.2 | 2 |
| 2017 | 780 | 780 | 769 | 129 | 4.0 | 0 |
| 2018 | 543 | 543 | 539 | 103 | 4.2 | 3 |
| 2019 | 565 | 565 | 166 | 39 | 4.0 | 2 |
| 2020 | 804 | 466 | 131 | 42 | 3.2 | 0 |
| 2021 | 833 | 480 | 158 | 45 | 3.0 | 1 |
| 2022 | 494 | 477 | 155 | 58 | 3.4 | 4 |
| 2023 | 461 | 461 | 140 | 37 | 4.0 | 1 |
| 2024 | 556 | 556 | 152 | 52 | 4.0 | 2 |
| 2025 | 840 | 466 | 138 | 52 | 3.2 | 3 |

## Particiones preliminares

| Conjunto | Años | Todos | Con M ≥ 4,0 |
|---|---|---:|---:|
| train_2015_2023 | 2015–2023 | 6.240 | 5.532 |
| validation_2024 | 2024 | 556 | 556 |
| test_2025 | 2025 | 840 | 466 |

**Ventana temporal:** entrenar 2015–2023, validar 2024 y reservar 2025 como prueba final. El análisis descriptivo de completitud de 2025 no autoriza usar sus resultados para elegir hiperparámetros.

## Hallazgos metodológicos que requieren una decisión

1. **Cambio abrupto de distribución de magnitudes.** En 2016 hay 942 de 946 eventos con M ≥ 4,5; en 2024 son 152 de 556. Los mínimos registrados también cambian: 2016 M 4,2; 2024 M 4,0; 2025 M 3,2. No se conoce la causa a partir del Excel. Debe validarse si cambiaron cobertura, selección, magnitud o criterios de catálogo.
2. **Umbral M ≥ 4,0, opción preliminar, no decisión definitiva.** Produce 5.532 casos para entrenamiento, 556 para validación y 466 para prueba, pero no elimina los cambios distributivos de 2015–2018. La selección final debe fijarse usando únicamente entrenamiento y validación.
3. **Clase profunda muy escasa.** Entre 2015–2025 hay 44 eventos con profundidad >300 km: 39 en entrenamiento, 2 en validación y 3 en prueba. Una clasificación KNN de tres clases produciría métricas poco estables para esa categoría. Evaluar un objetivo binario o aclarar carácter exploratorio.
4. **Límite técnico actual de snapshots.** Si la aplicación mantiene el máximo de 5.000 filas por dataset, los 7.636 registros totales y los 5.532 de entrenamiento con M ≥ 4,0 superan ese límite. No recortar silenciosamente; adaptar el almacenamiento de snapshots históricos y su integridad.
5. **Sin clase de región/departamento.** El libro solo tiene coordenadas; no se puede asumir que contenga etiquetas regionales validadas. Una clasificación espacial exige una tabla de límites validada si se desea añadir departamento.
6. **Sin objetivo predictivo de ocurrencia.** Los modelos propuestos son análisis retrospectivos de propiedades de eventos ya registrados; no permiten inferir cuándo ocurrirá un sismo futuro.

## Distribuciones preliminares para modelos

- Profundidad en 2015–2025: 4.503 superficial (≤60 km), 3.089 intermedia (>60 y ≤300 km), 44 profunda (>300 km).
- Para M ≥ 4,0, clases ilustrativas de magnitud (solo para auditar viabilidad):
  - Entrenamiento: 1.737 de M 4,0–4,49; 3.071 de M 4,5–4,99; 724 de M ≥ 5,0.
  - Validación: 404 / 100 / 52, respectivamente.
  - Prueba 2025: 328 / 86 / 52, respectivamente.
- La distribución es distinta entre entrenamiento y validación/prueba. Una comparación numérica sin verificar esta diferencia podría inducir conclusiones erróneas.

## Próxima etapa recomendada

1. Documentar el origen y las reglas de selección del Excel (incluidas posibles diferencias entre años) y fijar su SHA-256.
2. Elegir el umbral y las clases sin optimizar contra la prueba final de 2025; revisar 2015–2018 frente a 2019–2024.
3. Definir un esquema histórico versionado separado de `seismic_events`, sin alterar las estadísticas operativas de 2026.
4. Construir snapshot y particiones inmutables, guardar informe de calidad y aprobarlo antes del entrenamiento.
5. Entrenar baselines y los cuatro algoritmos, registrando métricas, estabilidad temporal y limitaciones.

**Nota:** este documento se basa exclusivamente en los valores del Excel aportado. No compara las filas contra una fuente oficial en línea.
