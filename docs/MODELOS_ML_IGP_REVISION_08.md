# Modelos ML IGP — Revisión 08: lectura clara de Comparación

## Alcance

Cambio exclusivo de React. No modifica FastAPI, Supabase, migraciones, experimentos ni predicciones.

- Los títulos identifican explícitamente **Validación IGP 2024** y **Prueba final independiente IGP 2025**.
- Ambas tablas reutilizan las mismas ocho columnas, anchos y orden: **Algoritmo, Objetivo, Métrica, Baseline, Resultado del modelo, Mejora, Métrica adicional, Detalle**. El resultado de 2025 permanece solo en resumen (sin inventar predicciones individuales).
- Los indicadores de clasificación (F1 macro, accuracy, precisión y recall) se presentan en porcentajes con **dos decimales**. Sus diferencias se expresan en **puntos porcentuales (pp)**. MAE/RMSE conservan unidades de magnitud (M) o profundidad (km), y R² se muestra como coeficiente decimal.
- Las definiciones e interpretación de métricas aparecen al pulsar el icono `Info` de lucide-react. La tarjeta es accesible por teclado y se cierra con `Escape`, clic externo o desplazamiento.
- **Trazabilidad por sismo · Validación 2024** inicia contraída, se abre con su botón y se restablece al cambiar de modelo. El CSV de pares completos permanece disponible cuando los registros estén cargados.
- En la interfaz, «corrida» pasa a **ejecución** o **evaluación**, sin alterar los identificadores `batch_id` ni los datos almacenados.

## Verificación

- 32 pruebas estáticas de frontend aprobadas: revisiones 01–08, incluidas cinco nuevas y la prueba 04 actualizada para la nueva redacción.
- Sintaxis TSX comprobada mediante el compilador TypeScript.
- La compilación Vite completa y la revisión visual quedan por ejecutar en el repositorio del usuario.

## Instalación y pruebas

Extraer el ZIP desde la raíz de `sismo-platform-v2` sin modificar ninguna migración. Ejecutar `node --test tests/frontend/modelos-ml-*.test.cjs` desde la raíz y `npm run build` desde `apps/web`.
