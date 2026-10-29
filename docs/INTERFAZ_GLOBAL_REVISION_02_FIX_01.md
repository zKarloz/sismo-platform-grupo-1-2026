# Interfaz global 02 — corrección del instalador (01)

- **Causa:** el instalador comparaba literalmente `<ExternalLink size={12}/>` y el mapa actual usa `<ExternalLink size={12} />`. Son formas TSX equivalentes.
- **Solución:** se identifica el enlace exclusivamente dentro de `Epicenter()` con una expresión regular que tolera espacios y saltos de línea; se exige una única coincidencia, y se mantiene la validación previa antes de escribir archivos.
- **Efecto:** permite ejecutar el parche original de color compartido, validación de sesión, enlace individual del reporte IGP y mitigación visual de juntas entre mosaicos. El script sigue generando respaldos y es idempotente.
- **Pruebas:** ejecución completa sobre el `Page.tsx` recibido, segunda ejecución sin cambios, cinco pruebas originales y cuatro nuevas verificaciones de compatibilidad. Sintaxis TSX verificada.
- **Datos:** no requiere SQL, Supabase, modificación de eventos ni servicios backend.
