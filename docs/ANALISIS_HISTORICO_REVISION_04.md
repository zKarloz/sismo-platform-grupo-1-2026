# Análisis histórico — Revisión 04

## Cambios
- El año del modal **Filtros** pasa de lista a campo nativo `type="number"`, con flechas, incremento de uno y límites **1960–2026**. Se valida antes de construir el mes civil peruano; al salir del campo se normaliza un valor manual fuera de rango.
- **Análisis histórico** adopta `withCurrentPeruMonth`, la misma política del Dashboard: cuando no existen fechas explícitas, todos los gráficos, su resumen, el lateral y la descarga CSV consultan el mes actual de Perú (`UTC−05`). Las fechas personalizadas se respetan hasta pulsar **Limpiar**.
- La serie temporal comienza agrupada por **día** para que el mes en curso tenga una distribución útil. Se puede seleccionar la agrupación mensual desde el gráfico.
- Se conserva el componente compartido `FilterBar` y sus comportamientos en Dashboard/Mapa. No se cambia la fuente: exclusivamente IGP/CENSIS.

## Pruebas
`node --test tests/frontend/analisis-historico-revision-01.test.cjs tests/frontend/analisis-historico-filtros-02.test.cjs tests/frontend/analisis-historico-selectores-03.test.cjs tests/frontend/analisis-historico-periodo-04.test.cjs`

Compilar desde `apps/web` con `npm run build` y comprobar el modal en navegadores de escritorio y móvil, en modo claro y oscuro.

## Despliegue
Solo frontend (Vercel). Sin cambios en FastAPI, Supabase ni GitHub Actions. Los filtros solo consultan el catálogo IGP/CENSIS sincronizado; no implican disponer de todo el archivo instrumental 1960–2025.
