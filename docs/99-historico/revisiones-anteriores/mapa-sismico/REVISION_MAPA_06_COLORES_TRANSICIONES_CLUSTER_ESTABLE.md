# Revisión Mapa 06 — Colores, transiciones y agrupación estable

## Objetivo

Corregir cuatro problemas del Mapa sísmico IGP/CENSIS sin modificar datos, API, Supabase ni filtros:

1. **Epicentros individuales:** `CircleMarker` usa el semáforo fijo por magnitud (`#22c55e`, `#eab308`, `#ef4444`, gris `#94a3b8`), tanto en claro como oscuro. Las filas del resumen del grupo muestran el mismo color de cada evento. Los **círculos numerados permanecen azul oscuro**, porque representan cantidad y no magnitud.
2. **Animaciones:** el resumen al pasar el ratón o tocar la agrupación entra y sale con una transición de 160/150 ms. La preferencia de accesibilidad `prefers-reduced-motion` reduce esas animaciones.
3. **Jerarquía visual:** el tooltip activo recibe prioridad `z-index` por encima de las demás etiquetas de agrupación, conservando el aislamiento del mapa bajo los modales y el sidebar móvil.
4. **Agrupación reproducible:** seleccionar un sismo ya no lo elimina de su grupo. Su marcador y su ficha se dibujan temporalmente encima. Seleccionar desde la vista previa **no provoca zoom automático**; enlazarlo desde el Dashboard mantiene el enfoque especial existente. Regresar al mismo zoom, con el mismo catálogo y los mismos filtros, produce los mismos grupos. Cambiar zoom, datos o filtros sí puede producir otros grupos de forma legítima.

La ventana de agrupación hereda la tipografía de la aplicación en lugar de la fuente predeterminada de Leaflet.

## Instalación

Desde la raíz del repositorio, después de revisar `git status --short`:

```bash
unzip -o ~/Downloads/sismo-platform-mapa-revision-06-colores-agrupaciones-estables.zip -d .
```

## Verificación automatizada

Desde la raíz:

```bash
node --test tests/frontend/mapa-clusters.test.cjs tests/frontend/mapa-leyenda-hover.test.cjs
cd apps/web && npm run build
```

Las pruebas puras y de contrato no sustituyen la verificación visual de Leaflet en navegador. No hay migraciones ni dependencias nuevas.

## Verificación manual

1. Seleccionar un período con sismos M4.4, M4.5, M5.9 y M6.0 (si están disponibles) y comprobar verde, amarillo y rojo en los **puntos individuales**; en ambos temas no debe variar el color.
2. Alejar el mapa para ver grupos numerados. Pasar el ratón por uno y observar una apertura suave; la ficha debe **cubrir los números de los otros grupos** si se superponen y su fuente debe coincidir con las fichas de epicentro.
3. Elegir un evento dentro del resumen: se abre su ficha sin zoom; cerrar la ficha y verificar que el grupo mantiene su cantidad.
4. Cambiar manualmente el zoom y volver **al mismo nivel de zoom**. Si los datos y filtros son los mismos, deben recuperarse exactamente los mismos integrantes de cada agrupación.
5. Comprobar con teclado la lista accesible de epicentros y, en móviles, el toque sobre grupos. Verificar que los modales y el sidebar sigan por encima del mapa.

La agrupación representa proximidad *en pantalla*; no constituye un área de peligro, afectación, intensidad ni predicción.
