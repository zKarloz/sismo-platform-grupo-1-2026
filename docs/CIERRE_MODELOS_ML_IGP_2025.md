# Cierre metodológico — Modelos ML IGP (validación 2024 y prueba 2025)

**Proyecto:** Sistema de Monitoreo Sísmico V2  
**Fecha de registro reportada de la evaluación final:** 29/10/2026, 01:31 (hora local reportada por el usuario)  
**Estado:** Evaluación final registrada; pendiente de revisión visual integral y de la documentación de métricas por clase de 2025.

## Datos y protocolo

- **Fuente:** catálogo instrumental IGP 1960–2025 proporcionado en Excel; subconjunto seleccionado con **M ≥ 4,0**.
- **Entrenamiento inicial:** 2019–2023 (2.449 eventos).
- **Validación:** 2024 (556 eventos), para comparar configuraciones y baselines.
- **Ajuste definitivo:** 2019–2024 (3.005 eventos), con configuraciones seleccionadas previamente.
- **Prueba final independiente:** 2025 (466 eventos). El usuario confirmó la ejecución única y registro en Supabase.
- **Dataset de desarrollo:** `igp_instrumental_2019_2024_m40`, versión 1, ID `3e00e137-22dd-470e-ae22-3b348f058c4f`.
- **Lote:** `52f16ea7-f552-4087-b9ca-aa937fde3e9f`.
- **Integridad de desarrollo:** SHA-256 `33597d32cc878f5210727439d3cf3c6284a52b85609bbfa6368a33a03a68815b`.
- **Integridad de la prueba final:** SHA-256 `5be7e67ea6be028a47c5ab56e13bf545782c9a1200be4e62b1625f6b4a9fde14`.

## Resultados reportados

| Experimento | Métrica | Baseline 2024 | Modelo 2024 | Baseline 2025 | Modelo 2025 | Mejora final |
|---|---|---:|---:|---:|---:|---:|
| Regresión lineal simple: magnitud desde profundidad | MAE (M; menor mejor) | 0,322 | 0,318 | 0,326 | 0,324 | 0,002 M menos |
| Regresión lineal múltiple: profundidad desde latitud y longitud | MAE (km; menor mejor) | 48,128 | 33,698 | 47,707 | 31,439 | 16,268 km menos |
| KNN: profundidad superficial / no superficial | F1 macro (mayor mejor) | 0,367 | 0,866 | 0,342 | 0,873 | +0,531 |
| Random Forest: tres rangos de magnitud | F1 macro (mayor mejor) | 0,281 | 0,418 | 0,275 | 0,424 | +0,149 |

**Métricas adicionales de validación 2024:** R² regresión simple 0,026 (baseline −0,004); R² regresión múltiple 0,353 (baseline −0,004); accuracy KNN 0,871 (baseline 0,581); accuracy Random Forest 0,534 (baseline 0,727). Se han redondeado para esta tabla. No se proporcionaron R² ni accuracy de prueba 2025 en este intercambio.

## Interpretación y limitaciones

1. **KNN** presenta el mayor margen de F1 macro frente a su baseline, pero clasifica solamente dos grupos de profundidad. La clase «no superficial» incluye sismos intermedios y profundos debido a la escasez de ejemplos de más de 300 km. `StandardScaler` normaliza latitud/longitud, no aumenta el número de eventos profundos.
2. **Regresión múltiple** disminuye el MAE final en 16,268 km respecto al baseline (~34,1 %). Es un análisis retrospectivo de profundidad según coordenadas, no un modelo causal ni un pronóstico de ocurrencia sísmica.
3. **Random Forest** mejora F1 macro, pero en 2024 el accuracy fue menor que el baseline. Deben mostrarse las matrices de confusión y métricas por clase; no declarar superioridad en todos los criterios.
4. **Regresión simple** ofrece una mejora marginal del MAE y un R² de validación muy bajo. Mantener como experimento didáctico con esa limitación explícita.
5. **Alcance del dataset:** solo eventos del catálogo escogido con M ≥ 4,0; posibles cambios de cobertura y selección entre años; estos modelos describen atributos de sismos ya observados y no predicen cuándo o dónde ocurrirá el siguiente terremoto.
6. Los resultados de prueba 2025 ya fueron utilizados una vez para evaluación final. **No volver a seleccionar hiperparámetros basándose en esta prueba** ni repetirla para intentar mejorar métricas de esta misma versión.
7. No se han reportado en este intercambio probabilidades calibradas ni intervalos predictivos para la sección 6.7. Mantener las estimaciones como retrospectivas, sin alertas oficiales ni afirmaciones de incertidumbre no sustentadas.

## Comprobaciones y pendientes para cierre de UI

- La revisión anterior reportó **14 pruebas backend** y **27 frontend** aprobadas; compilación Vite de producción correcta, con aviso no bloqueante por tamaño del bundle.
- El flujo de aprobación del dataset y la evaluación final fueron confirmados por el usuario mediante salidas de CLI y consulta de Supabase.
- Verificar visualmente que **Comparación** distinga 2024 de 2025 y muestre el resultado final sin confundirlo con la tarjeta detallada de validación.
- Comprobar métricas y matriz de confusión **por clase en prueba 2025** si ya están persistidas, sin reentrenar ni alterar el conjunto final.
- Revisar visualmente **Datasets, Calidad, Trazabilidad, Experimentos, Comparación y Estimaciones** y la ausencia de integración automática con alertas oficiales.

**Trazabilidad del documento:** las cifras se tomaron de los resultados de Supabase, CLI y la interfaz que el usuario compartió en esta conversación; no se ejecutaron nuevos entrenamientos ni consultas a la base para generar este informe.
