# Componente compartido de carga — fase de integración 01

- Se incorporó `apps/web/src/components/ui/LoadingSpinner.tsx` con Lucide `LoaderCircle` y Tailwind `animate-spin`.
- Formatos `inline`, `centered` y `overlay`; tamaños `sm`, `md` y `lg`; etiqueta accesible y respeto a `prefers-reduced-motion`.
- Integrado en **Auditoría**, **Reportes** y **Mapa sísmico** usando los archivos adjuntos de esas páginas. No cambia permisos, endpoints, PostgreSQL, sidebar ni paletas del tema claro/oscuro.
- La integración al resto de módulos requiere sus páginas más recientes: la estructura de carpetas por sí sola no permite identificar los estados de carga con seguridad.
- Auditoría: historial, exportación, configuración y guardado. Reportes: historial, opciones, configuración y generación. Mapa: consulta de epicentros y búsqueda de reporte IGP.
- Verificar `npm run build`, interacción de ambas pestañas de Auditoría, descarga y modalidad de carga con red lenta antes de desplegar.
