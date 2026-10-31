# Centro de alertas — Ajuste de colores en Entregas 02

## Alcance

- El detalle expandido conserva el diseño horizontal en escritorio, tarjetas en móvil y flecha giratoria.
- **Solo la observación** usa fondo amarillo en tema claro y ámbar en tema oscuro; el resto de la fila y el panel usan `bg-panel-alt/40`, borde neutral y tipografía del tema (`text-main`, `text-muted`).
- Se conservan filtros y estados separados: **Cancelada** es una cancelación administrativa; **Caducada** corresponde a `EVENT_TOO_OLD`, una entrega de correo que superó la ventana de antigüedad.
- No modifica la lógica de envíos, endpoints, tablas PostgreSQL, variables ni GitHub Actions.

## Validación

```bash
node --test tests/frontend/centro-alertas-entregas-ajuste-01.test.cjs tests/frontend/centro-alertas-entregas-colores-02.test.cjs
cd apps/web && npm run build
```

Comprobar en tema claro, oscuro, escritorio y móvil que únicamente la tarjeta **Observación** tenga el fondo semántico amarillo/ámbar.
