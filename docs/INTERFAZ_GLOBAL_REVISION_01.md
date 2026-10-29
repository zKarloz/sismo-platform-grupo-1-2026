# Interfaz global — Revisión 01

**Alcance:** React/Tailwind; no modifica FastAPI, Supabase, modelos ni métricas.

- Sidebar con la misma superficie del topbar en temas claro y oscuro; borde y colores activos ajustados para mantener contraste con el contenido.
- Scrollbar vertical mínimo en el sidebar y horizontal mínimo en tablas desplazables de Modelos ML (Firefox y WebKit/Blink).
- Menú de usuario con apertura y cierre animados en 200 ms, con alternativa para movimiento reducido; botón reducido a ícono en pantallas pequeñas y etiqueta accesible.
- Cursor de mano en botones/enlaces/controles habilitados; cursor no permitido en deshabilitados.
- Instalación mediante script idempotente, con respaldo de los tres archivos existentes en `.ui-polish-backups/`. No se sobrescriben versiones recientes completas de AppLayout ni del módulo ML.

**Limitaciones:** comprobar visualmente en navegador el comportamiento de la tarjeta y los scrollbars en Chrome, Firefox y pantallas móviles. La compilación Vite completa debe ejecutarse en el repositorio local del usuario.

**Pruebas:** `node --test tests/frontend/ui-polish-global-01.test.cjs` y `cd apps/web && npm run build`.
