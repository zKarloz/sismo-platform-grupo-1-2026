<!--
Proyecto: Sistema de Monitoreo Sísmico V2
Fase: 0 - Descubrimiento y viabilidad
Propósito: registrar decisiones técnicas para habilitar la Fase 1 sin atribuir validación científica no realizada.
Actualizado: 2026-10-22
-->

# Fase 0 - Alcance, viabilidad y backlog priorizado

**Proyecto:** Sistema de Monitoreo Sísmico V2  
**Estado:** Cierre operativo para iniciar implementación; validaciones externas identificadas como pendientes.  
**Fecha de decisión:** 22 de octubre de 2026  
**Documentos base:** `Plan_Desarrollo_Sistema_Monitoreo_Sismico_ML.pdf` (especialmente secciones 9, 14 y 15) y `Fase_0_revisar.txt`.

## 1. Objetivo y restricciones irrenunciables

Construir una plataforma web para **consultar, almacenar, visualizar y analizar sismos ya ocurridos**, con experimentos de Machine Learning **retrospectivos y exploratorios** y un centro de avisos **internos** asociados a eventos efectivamente reportados.

**No se implementará:** predicción de sismos futuros, estimación de fecha o lugar del siguiente terremoto, pronósticos de peligro inminente, alertas tempranas sísmicas ni mensajes que simulen comunicaciones oficiales del IGP/INDECI.

**Alcance de la entrega acelerada:** MVP demostrable y reproducible, no plataforma empresarial certificada ni servicio público de emergencias. No se toma como compromiso la duración del plan original (14-18 semanas), pero se conserva su arquitectura modular y sus controles fundamentales.

## 2. Usuarios y permisos

Se conservan los cinco roles del TXT y de la sección 6.12 del plan:

| Rol                     | Acciones autorizadas en el MVP                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **Administrador**       | Gestionar usuarios, activar/desactivar reglas, fuentes y configuración; consultar auditoría. |
| **Analista**            | Consultar datos, análisis y datasets; ejecutar experimentos ML; exportar datos.              |
| **Operador de alertas** | Revisar eventos, simular reglas, aprobar avisos internos y consultar entregas.               |
| **Auditor**             | Consultar registros de auditoría, trazabilidad y reportes, sin modificar información.        |
| **Solo lectura**        | Consultar dashboard, mapa, eventos y análisis públicos del entorno interno.                  |

**Campos de usuario:** nombre, correo único, rol(es), estado, fecha de alta, último acceso; MFA como capacidad futura, no requisito para la demostración. No almacenar contraseñas en texto plano. **Toda autorización se verifica en FastAPI**, no solo ocultando controles en React. La creación de cuentas se restringe al administrador; no se habilita registro público.

## 3. Cobertura geográfica

**Cobertura:** territorio peruano completo, con zona de interés marítima próxima al litoral para incluir sismos frente a la costa. Los filtros mostrarán claramente la diferencia entre **Perú continental** y **zona marítima de interés**, que no equivale a jurisdicción nacional.

**Regla de ingesta:** la consulta al proveedor podrá usar un rectángulo geográfico amplio; la clasificación final se hará con una geometría de Perú y una franja marítima de alcance configurable. No se contabilizarán automáticamente sismos de países vecinos como eventos peruanos por el solo hecho de aparecer en el rectángulo.

**Alcance regional:** nacional desde el inicio; filtros por departamento/región si los polígonos administrativos y sus licencias quedan disponibles. En caso contrario, filtros nacionales, espaciales y por coordenadas cumplen el MVP; las etiquetas administrativas se difieren.

## 4. Fuentes de datos elegidas

| Fuente                               | Uso                                                      | Formato / disponibilidad                                                                       | Decisión                                                                                   |
| ------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **USGS - Earthquake Catalog/ComCat** | Eventos recientes y actualización de registros           | GeoJSON; API FDSN con filtros temporales/geográficos y `updatedafter`; feeds GeoJSON recientes | **Fuente operativa inicial.**                                                              |
| **IGP - Catálogo Sísmico 1960-2025** | Estudios históricos nacionales y exploración ML          | CSV descargable, con diccionario de datos; actualización declarada anual                       | **Fuente histórica complementaria, importación por lote.**                                 |
| **IGP - CENSIS / servicios ArcGIS**  | Contraste eventual de reportes y posible conector futuro | Portal oficial y servicios públicos identificados                                              | **No comprometer ingesta automática hasta verificar interfaz, condiciones y estabilidad.** |

La publicación del IGP en la Plataforma Nacional de Datos Abiertos describe el catálogo instrumental 1960-2025, bajo **Open Data Commons Attribution License (ODC-By)**, con periodicidad **anual** y un recurso de unas **24 289 filas** (~1,26 MB, según el portal; son cifras del archivo publicado, no del total de eventos detectados en Perú).

La documentación de USGS explica el API de eventos y feeds GeoJSON actualizados cada minuto. Esto **no garantiza** que todo sismo peruano se registre inmediatamente: publicación, revisiones, cobertura y límites de magnitud dependen del proveedor. Para aplicación automatizada de información reciente se priorizarán los feeds; para backfill y consultas a medida, FDSN.

**Licencia / atribución:** conservar `source_id`, `source_url`, licencia, fecha de consulta y metadatos de procedencia. Mostrar crédito IGP/USGS y enlace original en la interfaz y exportaciones. La guía de USGS explica que la situación jurídica depende del conjunto publicado y de sus colaboradores; antes de redistribuir masivamente, comprobar los términos específicos del material utilizado. La licencia declarada del dataset IGP no debe extenderse sin evidencia a otros servicios IGP.

### Referencias oficiales consultadas

- USGS API FDSN: https://earthquake.usgs.gov/fdsnws/event/1/
- USGS feeds GeoJSON: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- USGS licencias de datos: https://www.usgs.gov/data-management/data-licensing
- IGP CENSIS: https://censis.igp.gob.pe/
- Catálogo IGP y licencia: https://www.datosabiertos.gob.pe/dataset/cat%C3%A1logo-s%C3%ADsmico-desde-1960-instituto-geof%C3%ADsico-del-per%C3%BA-igp
- Recurso de catálogo IGP: https://www.datosabiertos.gob.pe/dataset/catalogo-sismico/resource/f9629081-0721-4101-a2c2-d0622e046f8b

## 5. Frecuencia, volumen y calidad

**Frecuencia propuesta:** sincronizar eventos recientes **cada 5 minutos** desde la fuente operativa, con consulta solapada para no perder eventos publicados tarde; revalidar periódicamente registros de la semana previa por correcciones del proveedor. El intervalo es una **decisión del sistema**, no la frecuencia prometida por USGS.

**Histórico:** cargar el CSV del IGP **una sola vez por versión** y conservar el hash/checksum, periodo de cobertura y fecha de publicación del dataset. Importar USGS por ventanas temporales cuando haga falta para consultas recientes, sin mezclar catálogos en un mismo KPI.

**Volumen:** el archivo IGP publicado tiene cerca de 24 mil registros. El volumen de USGS en la zona y umbral escogidos **se medirá** mediante `count`/primera carga; no se inventa una media mensual. Registrar registros vistos, nuevos, actualizados, descartados y fallidos en `ingestion_runs`.

**Calidad:** claves únicas `(source_id, external_id)`, timestamps UTC, coordenadas válidas, conservación de magnitud y `magnitude_type`, profundidad original, campos nulos, estado de revisión y momento de última actualización de la fuente. Si un evento cambia de magnitud/posición, actualizar la ficha y conservar trazabilidad del cambio. Los sismos IGP y USGS potencialmente coincidentes **no se fusionarán automáticamente** ni se sumarán por defecto en una métrica única.

## 6. Política de alertas internas

<!-- Importante: estos umbrales son reglas de producto ajustables, NO una escala oficial de amenaza. -->

- **Detonante único:** recepción o actualización de un sismo **ya reportado** por una fuente autorizada; las cargas históricas iniciales nunca generan avisos operativos.
- **Reglas iniciales de prueba:** magnitud `>= 4.5` (aviso informativo) y magnitud `>= 6.0` (revisión prioritaria). Son **umbrales configurables ilustrativos**, no clasificación oficial de peligrosidad, daño ni intensidad.
- **Zonas:** Perú continental y franja marítima de interés. El operador puede restringir reglas por zona, fuente y magnitud.
- **Canal del MVP:** centro de alertas **dentro de la aplicación**. Sin SMS, WhatsApp, sirenas, push público ni correos masivos.
- **Flujo:** evento recibido → comprobación de regla → aviso interno pendiente → revisión/validación por Operador de alertas o Administrador → registro del estado. La generación automática no supone aprobación humana.
- **Deduplicación:** por `(event_id, rule_id, channel)`; conservar revisiones y cambios de estado, sin múltiples avisos por cada sincronización. Probar reintentos sin duplicación cuando existan canales externos.
- **Texto obligatorio:** «Aviso informativo del sistema basado en un evento sísmico reportado. **No es una alerta oficial ni una predicción**». Incluir fuente, fecha de ocurrencia, fecha de publicación/consulta y enlace original.
- **Fallas:** mostrar «fuente desactualizada / sincronización fallida» en lugar de inventar ausencia de actividad.

## 7. Indicadores y validación científica

Indicadores inicialmente permitidos: **número de eventos reportados** en un conjunto delimitado, distribución por magnitud, profundidad observada (km), conteos por periodo, mapa de epicentros, última sincronización y calidad de datos. Mostrar **periodo, fuente, muestra, unidades y filtros** en cada gráfico.

**No interpretar** un conteo más alto como incremento directo del riesgo, una diferencia entre catálogos como cambio real en la sismicidad, ni una correlación como causalidad.

**Pendiente de especialista:** confirmar semántica y comparabilidad de `magType` (Mw, mb, ML, etc.); metodología/precisión de profundidad; completitud según año y magnitud; cambios de red de sensores; tratamiento de revisiones y umbrales. La ausencia de esa revisión **no bloquea la construcción** de las pantallas y del pipeline, pero **sí bloquea afirmaciones científicas o etiquetas oficiales**. Registrar nombre, fecha, aspecto validado y observaciones cuando ocurra la revisión.

## 8. ML exploratorio: límite funcional

**Objetivo:** demostrar preparación de datos, entrenamiento, evaluación y trazabilidad de experimentos con **eventos históricos ya observados**.

1. **Clasificación retrospectiva:** clasificar registros históricos en rangos de magnitud definidos para la exploración, evitando incluir como feature la propia magnitud o atributos que revelen directamente la etiqueta.
2. **Regresión exploratoria:** estudiar la asociación entre atributos registrados y una variable continua como profundidad (km), con baseline y métricas MAE, RMSE y R²; documentar que no corresponde a un mecanismo causal.
3. **Control metodológico:** datasets versionados y separados por fuente, partición temporal de entrenamiento/validación, prevención de fuga de datos, métricas reproducibles y documentación de limitaciones. Si el análisis de calidad muestra que un experimento no es defendible, presentarlo solo como ejercicio didáctico y no publicar inferencias operativas.

**No habrá endpoint ni interfaz de predicción futura**, ni salidas ML conectadas a reglas de alertas. La revisión especializada del target es requisito para realizar afirmaciones científicas.

## 9. Arquitectura y método de trabajo

Conservar la estructura modular del PDF:

- **Frontend:** React + TypeScript + Vite; Tailwind CSS, iconos Lucide React, Recharts, Leaflet/MapLibre; diseño responsive profesional.
- **API:** FastAPI + Pydantic, endpoints versionados `/api/v1`, validación, permisos, OpenAPI.
- **Persistencia:** PostgreSQL, migraciones Alembic, índices por fuente/fecha/magnitud y tablas de ingesta, eventos, usuarios, reglas, avisos y auditoría.
- **ML:** Python, pandas, scikit-learn, joblib; proyecto de experimentos separado de la API y del frontend.
- **Ejecución:** 3 terminales permanentes: backend, frontend y pruebas. Docker Compose para levantar dependencias cuando sea viable.
- **Documentación:** `docs/FASE_X.md` breve por fase, con decisiones, comandos, evidencias, pruebas y pendientes.

Para respetar el tiempo, **posponer** Redis/Celery, MFA, notificaciones externas, integración IGP en tiempo real, gestión empresarial compleja, despliegue público de alta disponibilidad y visualizaciones ML engañosas. Mantener pruebas esenciales, controles básicos y registro de errores desde el inicio.

## 10. Casos de uso prioritarios

| ID    | Caso                                       | Actor            | Resultado verificable                                         |
| ----- | ------------------------------------------ | ---------------- | ------------------------------------------------------------- |
| CU-01 | Ver tablero de eventos observados          | Todos            | KPIs con fuente, filtro y hora de corte.                      |
| CU-02 | Buscar y revisar un sismo                  | Todos            | Datos, mapa y URL de procedencia.                             |
| CU-03 | Sincronizar eventos desde USGS             | Admin/sistema    | Insertar/actualizar sin duplicados y registrar ejecución.     |
| CU-04 | Explorar un histórico IGP                  | Analista         | Gráficos y dataset identificado, sin mezcla de fuentes.       |
| CU-05 | Entrenar/evaluar experimento retrospectivo | Analista         | Métricas y versión de datos/modelo, sin predicción operativa. |
| CU-06 | Revisar un aviso interno por evento        | Operador         | Regla, evento, estado y aprobación auditados.                 |
| CU-07 | Gestionar permisos                         | Administrador    | Rol aplicado en interfaz y API.                               |
| CU-08 | Exportar y auditar                         | Auditor/Analista | CSV con procedencia; historial protegido.                     |

## 11. Backlog por prioridad (sin fechas de entrega)

| Prioridad | ID   | Implementación                                                                      | Prueba de término                                                   |
| --------- | ---- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **P0**    | B-01 | Monorepo, React/Tailwind/Lucide, FastAPI, PostgreSQL, `.env.example`                | Frontend y API arrancan; base conectada.                            |
| **P0**    | B-02 | Migraciones, entidades, usuarios y roles mínimos                                    | Tablas y autorización básica probadas.                              |
| **P0**    | B-03 | Conector USGS; ingesta y actualizaciones idempotentes                               | Repetir sincronización no duplica.                                  |
| **P0**    | B-04 | Dashboard, listado y detalle, mapa nacional, filtros                                | KPIs coinciden con la API y muestran fuente.                        |
| **P0**    | B-05 | Estadística y gráficos, exportación CSV                                             | Conteos reproducibles según filtros.                                |
| **P0**    | B-06 | Centro de alertas interno y reglas configurables                                    | Aviso solo de sismo existente; revisión, deduplicación y auditoría. |
| **P0**    | B-07 | Importación histórica IGP y control de calidad                                      | Dataset importado e identificado; reporte de nulos/duplicados.      |
| **P0**    | B-08 | Experimentos ML retrospectivos y métricas                                           | Dataset y resultados reproducibles; sin salida predictiva.          |
| **P0**    | B-09 | Pruebas de API/permisos/ingesta, respaldo-restauración, guía                        | Comandos y resultados documentados.                                 |
| **P1**    | B-10 | Auditoría ampliada, reportes PDF/XLSX y filtros departamentales                     | Funcionalidad verificada si alcanza el tiempo.                      |
| **P2**    | B-11 | MFA, avisos externos, conectores adicionales, orquestador de tareas y despliegue HA | Fuera del MVP acelerado.                                            |

**Orden de ejecución recomendado:** B-01 → B-02 → B-03 → B-04/B-05 → B-06 → B-07/B-08 → B-09. Trabajar en paralelo solo donde no haya dependencias. Si es necesario recortar, reducir P1/P2, **nunca** introducir predicción ni omitir procedencia y pruebas de idempotencia.

## 12. Criterios de aceptación del MVP

- [ ] La aplicación se ejecuta desde instrucciones y `.env.example`, en tres terminales de trabajo o contenedores equivalentes.
- [ ] Al menos una ingesta **real** desde USGS alimenta PostgreSQL; el evento muestra ID externo, fuente, fecha UTC, coordenadas, magnitud, tipo y profundidad disponible, y enlace de origen.
- [ ] Dos ejecuciones idénticas no crean duplicados; las correcciones del proveedor se reflejan y registran.
- [ ] La cobertura y filtros no presentan automáticamente sismos de países vecinos como peruanos; se distingue la zona costera.
- [ ] Tabla, mapa, dashboard, gráficas y CSV respetan los mismos filtros y conteos para **una fuente seleccionada**.
- [ ] Todos los gráficos muestran fuente, periodo, unidad, tamaño de muestra y fecha de actualización.
- [ ] Un aviso de prueba se produce solo por un evento almacenado y una regla aprobada; no se duplica ni se envía al público; consta que **no es oficial**.
- [ ] Se verifica que un usuario sin privilegios no puede ejecutar operaciones reservadas, ni por UI ni por API.
- [ ] Los experimentos ML registran dataset, versión, features, partición temporal, parámetros, métricas y limitaciones; no ofrecen predicción de sismos futuros.
- [ ] Se han ejecutado pruebas automatizadas básicas de API, ingesta, deduplicación, autenticación y reglas.
- [ ] Se documenta y prueba al menos un procedimiento simple de respaldo/restauración de la base.
- [ ] La documentación breve por fase incluye lo terminado, evidencias y lo pendiente.

## 13. Riesgos y tratamiento

| Riesgo                                                       | Nivel      | Mitigación / decisión                                                                                              |
| ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Fuente no disponible o datos retrasados                      | Alto       | Estado de sincronización visible; reintentos con límites; jamás sustituir eventos faltantes por datos ficticios.   |
| Interpretación incorrecta del tipo de magnitud o profundidad | Alto       | Mostrar valor y tipo originales; validación científica pendiente; no derivar índice de peligro.                    |
| Superposición IGP/USGS y conteos dobles                      | Alto       | Fuente explícita, datasets separados y KPIs por proveedor; no fusionar por proximidad solamente.                   |
| Avisos confundidos con alertas oficiales                     | Alto       | Canal interno, etiqueta persistente, revisión humana y bloqueo de canales externos.                                |
| Licencia/atribución insuficiente                             | Medio/alto | Registrar referencia y términos específicos; revisar antes de redistribución pública o integrar otra fuente.       |
| Alcance demasiado amplio para el plazo                       | Alto       | P0 funcional; P1/P2 opcionales; no desarrollar infraestructura empresarial no esencial.                            |
| Calidad y sesgo temporal del histórico                       | Alto       | Reporte de datos faltantes, limitaciones por periodo, partición temporal y exclusión de conclusiones prospectivas. |
| Fallo de permisos o pérdida de datos                         | Alto       | Roles protegidos por API, migraciones, logs y respaldo/restauración comprobados.                                   |

## 14. Puertas de decisión y cierre

**Resuelto para comenzar Fase 1:** objetivo no predictivo; cobertura Perú; cinco perfiles; USGS como fuente operativa; IGP como catálogo histórico separado; sincronización propuesta cada 5 minutos; avisos internos únicamente; arquitectura React/FastAPI/PostgreSQL; backlog P0 y pruebas de aceptación.

**Pendientes que no bloquean desarrollo local:** comprobar consumo efectivo del endpoint y medir volumen USGS en el filtro final; descargar/validar esquema y checksum del CSV IGP; acordar límites exactos de costa y geometría; revisión de indicadores por especialista; confirmar términos concretos antes de redistribuir datos o abrir canales públicos.

**Condición de seguridad:** si no existe validación científica documentada, el producto seguirá siendo **exploratorio e informativo**, y todo indicador controvertido mostrará su limitación. No se activarán notificaciones externas sin evaluación adicional.

**Decisión de fase:** **Fase 0 concluida a nivel de definición técnica del MVP**, sin afirmar que las comprobaciones pendientes ya se hayan completado. **Siguiente trabajo: Fase 1 - Base técnica y diseño UX.**
