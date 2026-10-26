# Mapa sísmico — Revisión 07: detalles y semáforo

**Alcance:** corrección puntual sobre `revision-mapa-sismico.zip` (versión actual del usuario). Sin migraciones ni cambios de API/Supabase.

## Hallazgos corregidos

- **Color incorrecto en epicentros:** `src/index.css` imponía `var(--ui-accent)` a todos los SVG `.sismo-point`, anulando los colores `pathOptions` de Leaflet. Se elimina esa regla y se establece también el color del SVG en línea para preservar el semáforo fijo: verde `<4.5`, amarillo `4.5–5.9`, rojo `>5.9`, gris sin dato. No varía entre temas.
- **Números que atraviesan el resumen:** antes, la ficha era un `div` dentro de un `Tooltip` en la misma capa que las etiquetas numeradas. Se usa ahora un `Popup` verdadero en `leaflet-popup-pane`, por encima de la capa de tooltips; `Tooltip` queda exclusivo para el contador.
- **Desplazamiento del resumen:** todos los eventos del grupo aparecen en una lista con alto máximo, barra fina y scroll interno. `L.DomEvent.disableScrollPropagation()` impide que la rueda sobre la lista active el zoom del mapa.
- **Interacción y foco:** clic/tap en el círculo numerado abre el resumen sin zoom. Clic/tap en un evento acerca el mapa suavemente, después selecciona su ID oficial y abre la ficha individual. Sin selección por cercanía ni mutación de los grupos. Al volver al zoom general el marcador temporal se oculta, manteniendo visibles los contadores originales.
- **Animación y letra:** el Popup de grupo tiene animación de entrada de 180 ms, usa fuente heredada y respeta `prefers-reduced-motion`.

## Validación

```bash
# Desde la raíz del monorepo
node --test tests/frontend/mapa-clusters.test.cjs tests/frontend/mapa-leyenda-hover.test.cjs
cd apps/web && npm run build
```

Prueba visual en ambos temas: confirma colores por magnitud, números detrás del Popup, rueda desplazando la lista sin alterar zoom, clic en un evento acercando y abriendo su ficha y reagrupación reproducible al volver al zoom anterior. En móvil, un toque abre el resumen y otro selecciona evento.

**Nota:** los grupos pueden cambiar normalmente al cambiar el zoom o cuando cambie el conjunto de datos. El color expresa magnitud observada, no daños o riesgo.
