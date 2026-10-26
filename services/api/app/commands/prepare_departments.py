"""Importa una vez los 25 polígonos desde un dataset INEI-derivado verificable.

No consulta ni modifica Supabase. El backend leerá el archivo resultante
localmente en cada despliegue; las peticiones del usuario no descargan mapas.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from app.geo.department_snapshots import (
    MAX_BYTES, SNAPSHOT_PATH, SOURCE_PAGE, SOURCE_URL, validate_collection,
)


def build_snapshot(raw: bytes, url: str) -> dict:
    by_name = validate_collection(raw)
    return {
        "type": "FeatureCollection",
        "features": [by_name[name] for name in sorted(by_name)],
        "_provenance": {
            "source": SOURCE_PAGE,
            "original_download": url,
            "sha256_original": hashlib.sha256(raw).hexdigest(),
            "downloaded_at_utc": datetime.now(timezone.utc).isoformat(),
            "note": "Cartografía referencial derivada de INEI; no es delimitación legal ni área de impacto sísmico",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Preparar límites departamentales para consulta sin red")
    options = parser.add_mutually_exclusive_group(required=True)
    options.add_argument("--download", action="store_true", help="Descargar del repositorio geográfico público")
    options.add_argument("--file", type=Path, help="Archivo GeoJSON descargado previamente")
    options.add_argument("--check", action="store_true", help="Validar el snapshot ya instalado")
    args = parser.parse_args()
    try:
        if args.check:
            content = SNAPSHOT_PATH.read_bytes()
            names = validate_collection(content)
            print(json.dumps({"status": "ok", "departments": len(names), "source": str(SNAPSHOT_PATH),
                              "sha256": hashlib.sha256(content).hexdigest()}, ensure_ascii=False))
            return 0
        if args.file is not None:
            content = args.file.read_bytes()
            url = str(args.file)
        else:
            # URL fija y tamaño máximo: no acepta direcciones arbitrarias del usuario.
            request = Request(SOURCE_URL, headers={"User-Agent": "SismoPlatformV2/1.0"})
            with urlopen(request, timeout=40) as response:
                content = response.read(MAX_BYTES + 1)
            url = SOURCE_URL
        result = build_snapshot(content, url)
        serialized = (json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        partial = SNAPSHOT_PATH.with_suffix(".geojson.tmp")
        partial.write_bytes(serialized)
        partial.replace(SNAPSHOT_PATH)
        print(json.dumps({"status": "ok", "departments": len(result["features"]),
                          "path": str(SNAPSHOT_PATH), "source": SOURCE_PAGE,
                          "sha256": hashlib.sha256(serialized).hexdigest()}, ensure_ascii=False))
        return 0
    except (OSError, ValueError, TimeoutError) as exc:
        print(json.dumps({"status": "error", "reason": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
