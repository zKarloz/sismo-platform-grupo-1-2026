# Revisión Auditoría 06 — Modal en teléfonos

- Se verificó que `apps/web/index.html` incluye `width=device-width, initial-scale=1.0`.
- Auditoría ya pasa `mobileSheet` al modal común; el fallo no requiere cambios en la consulta ni en PostgreSQL.
- Se incorporó `modalMobile.css`, importado desde `Modal.tsx`, para limitar el ancho del panel y de los controles de fecha en teléfonos, y asegurar desplazamiento vertical.
- Las reglas solo afectan a instancias con `mobileSheet` y no cambian los colores o el comportamiento de los demás modales.
- Verificar visualmente en Android/iOS y en Vercel a 320, 375 y 430 píxeles. Si el navegador móvil tiene activado «Sitio para ordenadores», desactivarlo.
- Confirmar en `apps/web` con `npm run build` y luego con la prueba frontend correspondiente.
