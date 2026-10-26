# Revisión 09 — Capas Claro, Oscuro y Satélite

## Objetivo

Incorporar nuevas capas de referencia al mapa sísmico **sin cambiar los eventos IGP/CENSIS, filtros, agrupaciones, popups ni el encuadre**. Se conservan OpenStreetMap y Sin mapa base.

## Proveedor

Las vistas **Claro** (`dataviz-light`), **Oscuro** (`dataviz-dark`) y **Satélite** (`satellite-v4`) utilizan teselas raster de **MapTiler**, compatibles con `TileLayer` de React-Leaflet. No son mosaicos de Google Maps.

- Documentación de MapTiler para Leaflet: https://docs.maptiler.com/leaflet/examples/how-to-use-leaflet/
- Documentación satelital: https://docs.maptiler.com/leaflet/examples/detect-retina/
- Claves API y restricciones: https://docs.maptiler.com/guides/developer/credentials/api-key/
- Atribución: https://docs.maptiler.com/guides/map-design/attribution/add-attribution/

**MapTiler requiere clave**. No se ha incluido ninguna clave en el parche. El token usado en Vite es visible en el navegador, por lo que debe ser una clave pública limitada a los orígenes de desarrollo/producción y con cuota configurada. Nunca utilizar una credencial privada o administrativa.

En el archivo **`apps/web/.env.local`** añadir:

```dotenv
VITE_MAPTILER_KEY=CLAVE_PUBLICA_RESTRINGIDA_DE_MAPTILER
```

Reiniciar Vite: `npm run dev`. Para Vercel, crear la misma variable en el proyecto y desplegar de nuevo. Se deben autorizar el dominio de Vercel y los orígenes locales que se usen (por ejemplo `http://127.0.0.1:5173` y `http://localhost:5173`) desde el panel de MapTiler.

Si falta la clave, se mantiene OpenStreetMap y Sin mapa base, y la UI explica por qué no están las demás opciones. Si una tesela no carga, verificar **F12 → Network** y la restricción de origen de MapTiler.

Con cada estilo de MapTiler se muestran créditos enlazados a MapTiler y OpenStreetMap y el logo para el plan gratuito; conservarlos visibles y revisar las condiciones de uso del plan seleccionado.

## Pruebas

Desde raíz del repositorio:

```bash
node --test tests/frontend/mapa-basemaps.test.cjs
```

Desde `apps/web`:

```bash
npm run build
npm run dev
```

Validación visual de aceptación:

1. Sin clave: OpenStreetMap y Sin mapa base siguen operativos.
2. Con clave: alternar OpenStreetMap, Claro, Oscuro, Satélite, Sin mapa base.
3. Cambiar capa no modifica período, epicentros, magnitudes, clusters ni centro/zoom.
4. Satélite muestra imágenes reales, no fotografías simuladas; verificar contraste de epicentros.
5. Verificar créditos y logo MapTiler en las tres capas y su ausencia con otras capas.
6. Repetir en móvil y con los temas claro y oscuro de la aplicación.

## Alcance

Frontend únicamente; sin migración SQL, cambios en FastAPI, Supabase, ingesta IGP ni experimentos ML. El estilo del mapa base es independiente del tema de la aplicación, seleccionado manualmente por usuario.
