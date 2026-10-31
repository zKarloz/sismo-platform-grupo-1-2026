# Revisión Mapa 05 — Semáforo de magnitud y agrupaciones por hover

## Alcance

- Fuente visible: IGP/CENSIS, sin cambios en consultas, Supabase o filtros.
- Epicentros individuales: clic para abrir ficha. Magnitud representada por color fijo:
  - Verde `#22c55e`: M < 4.5.
  - Amarillo `#eab308`: 4.5 ≤ M ≤ 5.9.
  - Rojo `#ef4444`: M > 5.9.
  - Gris `#94a3b8`: magnitud no disponible.
- Los colores son los mismos en tema claro y oscuro. Los tamaños se mantienen próximos entre sí (8–10 píxeles de radio).
- Las agrupaciones numeradas expresan **cantidad de sismos**, no magnitud ni área de impacto.
- Escritorio: pasar el puntero sobre una agrupación muestra hasta 20 eventos del grupo del grupo sin zoom ni cambio de marcadores. El resumen permanece disponible al llevar el puntero a la lista; sus filas abren la ficha individual.
- Móvil: tocar el grupo muestra el resumen sin hacer zoom. El acercamiento sigue disponible con gestos y controles cartográficos.
- Se conserva la lista accesible de epicentros que permite seleccionar eventos sin depender del mapa.

## Instalación

Descomprimir el parche desde la raíz. No requiere migraciones ni nuevas dependencias:

```bash
unzip -o ~/Downloads/sismo-platform-mapa-revision-05-semaforo-hover.zip -d .
cd apps/web && npm run build && npm run dev
```

Pruebas frontend desde la raíz del repositorio:

```bash
node --test tests/frontend/mapa-clusters.test.cjs tests/frontend/mapa-leyenda-hover.test.cjs
```

## Validación manual

1. Probar el tema claro y oscuro: M4.4 verde, M4.5 y M5.9 amarillo, M6.0 rojo, sin dato gris, si hay eventos de esos rangos en el período escogido.
2. Con zoom alejado, pasar el puntero sobre un círculo con número: ver el resumen sin que cambie el zoom.
3. Mover el puntero hasta la lista y seleccionar un evento: abrir su ficha individual.
4. Abrir un epicentro individual con clic: su ficha aparece igual que antes.
5. En móvil, tocar un círculo numerado: ver resumen sin zoom automático.
6. Verificar que el modal de filtros y sidebar no queden tapados por Leaflet.

**Limitaciones:** La leyenda expresa categorías de magnitud observada, no amenaza, intensidad ni daño estimado. Los grupos visuales no se incluyen en indicadores como eventos distintos. La vista previa enumera solo los primeros 20 registros del grupo; acercar el mapa permite separarlos.
