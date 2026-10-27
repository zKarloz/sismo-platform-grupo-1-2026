# Revisión Reportes 04 — Tarjetas y horario de día completo

## Cambios

- Se eliminó la tarjeta «Corte de datos». Permanecen dos KPI: «Reportes registrados» y «Tipos habilitados», en una distribución de dos columnas desde `sm`.
- Al elegir una **fecha nueva** en el formulario de «Generar reporte», `Desde` se fija a **00:00** y `Hasta` a **23:59**, hora local mostrada por el navegador. El usuario puede ajustar libremente la hora; si solo cambia la hora del mismo día, el valor no se restablece.
- El valor inclusivo enviado a FastAPI para `Hasta` termina en `:59.999999`, por lo que se conserva completo el último minuto (hasta 23:59:59.999999 cuando se eligió 23:59).
- «Fecha de corte» permanece en el historial y en los detalles/archivos para asegurar trazabilidad. No se modifica el backend ni Supabase.
- Se reutiliza el modal, el paginador y la paleta existentes; la fuente IGP/CENSIS permanece sin cambios.

## Pruebas

Terminal 2 (`apps/web`): `npm run build`

Terminal 3 (raíz):

```bash
node --test tests/frontend/reportes-corte-claridad.test.cjs tests/frontend/reportes-rango-dia-completo.test.cjs
```

La compilación Vite completa y la validación visual en teléfonos deben ejecutarse con el repositorio real.

## Consideración de zona horaria

La conversión conserva la semántica anterior de `datetime-local`: zona horaria local del **navegador**. En dispositivos ajustados a Perú (`America/Lima`) coincide con la hora de Perú. Si el sistema debe usarse fuera de Perú, una revisión específica deberá fijar el huso `America/Lima` en los filtros y su interpretación en el backend, para evitar diferencias de calendario.
