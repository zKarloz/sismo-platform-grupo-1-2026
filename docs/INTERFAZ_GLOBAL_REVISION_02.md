# Interfaz global y Mapa sísmico — Revisión 02

- El topbar y el sidebar utilizan el token `--ui-shell`. **Tema claro:** editar `--ui-shell: #e9edf2` dentro de `:root` de `apps/web/src/index.css`. El tema oscuro conserva `#171717`. Navegación y contenido siguen diferenciados.
- La validación inicial de sesión utiliza el `LoadingSpinner` compartido, encabezado e información accesible, sin alterar `AuthProvider` ni permitir ver pantallas protegidas prematuramente.
- Los popups de epicentro construyen el enlace individual `https://ultimosismo.igp.gob.pe/evento/YYYY-NNNN` solo si hay un código oficial validado o una URL individual válida. No se inventan enlaces para IDs ambiguos.
- Mitigación visual para líneas finas de juntas raster: solapamiento mínimo de los mosaicos de fondo mediante una clase específica de las capas base. Los contornos punteados de departamentos y las figuras de filtros permanecen intactos.
- Si siguen apareciendo líneas, aportar captura y capa activa: podrían corresponder a contornos de los filtros, a la cartografía del proveedor o a otra incidencia no reproducida.
- Parche idempotente; modifica únicamente `AppLayout.tsx`, `index.css`, `ProtectedRoute.tsx`, `mapa-sismico/Page.tsx` y `mapStyles.css`. Guarda respaldo en `.ui-polish-backups/global-02/`.
- No modifica API, Supabase, sismos, alertas ni Machine Learning.

Pruebas: `node --test tests/frontend/interfaz-global-02.test.cjs`; compilación local: `cd apps/web && npm run build`.
