# Revisión de carga compartida 02 — módulos restantes

- Se reutiliza `LoadingSpinner` (`lucide-react` + Tailwind) sin cambiar tema oscuro, colores ni consultas HTTP.
- **Exploración:** Dashboard, Eventos, consulta en vivo IGP, Histórico IGP (solo tras consultar), Análisis, Calidad y datasets, Modelos ML.
- **Administración:** Mis notificaciones, Alertas internas, Fuentes de datos, Usuarios y roles; incluye progreso de guardado y comprobación SMTP cuando ya existen estados de actividad.
- **Acceso:** Login y configuración de contraseña muestran progreso en sus operaciones existentes.
- Los otros módulos (Auditoría, Reportes, Mapa sísmico) se integraron en `parche-carga-compartida-01.zip`; este parche no sobrescribe esas páginas.
- Se conservan avisos de error, estados vacíos, estructura de tablas y rutas de API. Sin cambios de PostgreSQL o FastAPI.
- El indicador respeta `prefers-reduced-motion` mediante `motion-reduce:animate-none`.

## Comprobaciones

```bash
cd apps/web && npm run build
# En una tercera terminal, desde raíz:
node --test tests/frontend/loading-spinner-remaining.test.cjs tests/frontend/loading-spinner-shared.test.cjs
```

La compilación Vite completa debe ejecutarse contra el repositorio real; el ZIP de fuentes suministrado no contiene todas las dependencias.
