# Revisión 08 — Popups con ancho uniforme y zoom persistente

## Alcance

Corrección visual y de interacción de Mapa sísmico (IGP/CENSIS). No se modifican el backend, Supabase, los datasets ML ni la política de filtrado.

## Cambios

1. Los popups de **epicentro individual** y **agrupamiento** comparten la clase `sismo-event-popup` y un ancho de 300 px, adaptable a móviles mediante CSS. La lista interna del grupo mantiene su scroll.
2. `FitMarkers` encuadra las consultas cargadas y las nuevas zonas consultadas, pero **no depende de abrir o cerrar un popup**.
3. El autoencuadre usa solamente los eventos del catálogo filtrado, no una copia variable que incluya el evento seleccionado desde Dashboard.
4. El clic en un sismo de un grupo conserva el zoom intencionado (`flyTo`), abre su ficha y, al cerrarla, **no devuelve el mapa a la extensión inicial**.
5. La navegación explícita desde Dashboard conserva su acercamiento automático al reporte IGP.

## Verificación

```bash
# Desde la raíz del proyecto
node --test tests/frontend/mapa-leyenda-hover.test.cjs tests/frontend/mapa-popup-zoom.test.cjs

# Terminal 2 (desde apps/web)
npm run build
```

Comprobar manualmente con dos grupos de varios eventos:

- Los dos tipos de popup tienen el mismo ancho en tema claro y oscuro, también en móvil.
- Abrir grupo → seleccionar sismo → acercamiento → cerrar ficha: **sin reajuste de zoom**.
- Abrir un segundo marcador o hacer clic en una zona vacía: el zoom permanece intacto.
- Seleccionar otros filtros o ejecutar una nueva consulta sigue ajustando el mapa a los nuevos resultados.
- El mapa no tapa el modal, los filtros ni el sidebar móvil.

**Nota:** las pruebas Node comprueban contratos estructurales; la interacción final de Leaflet debe verificarse en un navegador. No requiere migraciones.
