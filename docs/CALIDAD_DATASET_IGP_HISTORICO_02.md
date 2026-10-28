# Calidad y datasets — Histórico IGP instrumental (etapa 02)

## Objetivo y fuente

Captura de desarrollo **IGP/CENSIS 2019–2024, M ≥ 4.0**, desde el archivo privado
`services/api/data/igp_catalogo_1960_2025.xlsx`. SHA-256 de la edición analizada:
`51e75ba1032cef71adfbb780626c33f52fed8a430c12221271dfaed62ade09ca`.
La importación se rechaza si el SHA-256 del archivo cambia sin revisión explícita.
**2025 no se incorpora** y se reserva para una única evaluación final, una vez cerradas las decisiones del modelo.

## Particiones verificadas en el Excel entregado

| Uso | Período UTC | Registros | Observaciones |
|---|---|---:|---|
| Entrenamiento | 2019–2023 | 2.449 | Sin datos 2024/2025 |
| Validación | 2024 | 556 | Solo para selección de hiperparámetros |
| Prueba final | 2025 | No incorporados | Reservados fuera de esta captura |
| **Desarrollo** | **2019–2024** | **3.005** | Sin truncamiento; máximo por dataset 5.000 |

Hash SHA-256 calculado sobre la lista canónica de las 3.005 filas congeladas:
`33597d32cc878f5210727439d3cf3c6284a52b85609bbfa6368a33a03a68815b`.
El hash de fuente prueba la edición del Excel, mientras que el hash del snapshot
prueba la lista ordenada de registros y variables utilizadas.

## Diseño y seguridad

- **Migración aditiva** `database/migrations/IGP_HISTORICO_DATASETS_01.sql`:
  crea `igp_historical_dataset_snapshots` (dataset, posición, fila Excel, partición y JSONB).
  Reutiliza `datasets` (versiones, SHA-256, calidad) y la inmutabilidad de la migración 002.
  No toca `seismic_events`, alertas, Dashboard ni datasets USGS anteriores.
- **CLI** `app.commands.create_historical_dataset`: primero vista previa sin BD; con
  `--commit` escribe metadatos y las filas en una transacción única. Es idempotente
  si ya existe una versión idéntica. No existe endpoint web de creación.
- **FastAPI** adapta lectura de preview/integridad al tipo de dataset y verifica fuente,
  hash y correspondencia train/validation sin presentar el conjunto final 2025.
- **React** identifica las versiones instrumentales y sus tamaños de partición en
  Calidad y datasets > Trazabilidad; se conserva el modal de vista previa.

## Ejecutar en un entorno autorizado

1. Confirmar que la migración 002 ya está aplicada y ejecutar
   `IGP_HISTORICO_DATASETS_01.sql` **una sola vez** en Supabase SQL Editor.
2. Mantener el Excel original en `services/api/data/igp_catalogo_1960_2025.xlsx`,
   sin subirlo a GitHub si no está autorizada su distribución.
3. Desde `services/api`, primero previsualizar:

   ```bash
   python -m app.commands.create_historical_dataset
   ```

4. Verificar el total 3.005, particiones 2.449/556 y los dos hashes; solo entonces,
   con `DATABASE_URL` configurada en el entorno autorizado, ejecutar:

   ```bash
   python -m app.commands.create_historical_dataset --commit
   ```

5. Consultar Calidad y datasets > Datasets > Vista previa / Trazabilidad e
   integridad. La aplicación ML actual **no** puede entrenar estos snapshots:
   su lector aún está vinculado al antiguo origen USGS y `dataset_snapshots`.
   Adaptarlo será el siguiente trabajo, junto con validación temporal y baselines.

## Limitaciones

- El Excel no informa escala/tipo de magnitud, localidad ni región. En el informe
  de calidad constan como **metadatos ausentes**; los cinco campos esenciales
  del experimento (fecha UTC, coordenadas, magnitud y profundidad) están completos.
- La distribución registrada cambia entre años; no se interpreta como cambio de
  sismicidad física. Los modelos serán **descriptivos y experimentales**.
- Este parche no aprueba datasets automáticamente, no realiza imputaciones, no
  entrena modelos y no utiliza 2025 para decidir hiperparámetros.
- Tests backend con SQLite no sustituyen una prueba controlada de la migración y
  restricciones en PostgreSQL real. No se han realizado escrituras en Supabase.
