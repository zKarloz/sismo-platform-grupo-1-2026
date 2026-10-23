# Ingesta de datos sísmicos — Fase 3

El adaptador USGS ejecutable vive en `services/api/app/ingestion/` para que el
comando y FastAPI compartan modelos, transacciones y configuración `.env` sin
instalar paquetes separados. Esta carpeta se reserva para desacoplar conectores
como IGP cuando haya más de una fuente activa.

Inicio local desde `services/api`:

```bash
python -m app.commands.sync_usgs --days 7 --min-magnitude 2.5
```

No usar un endpoint POST público de sincronización mientras no exista autenticación.
