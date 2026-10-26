"""Consulta paginada del año 2026 a la capa oficial IGP/CENSIS.

No modifica datos por sí sola: el comando anual permite --dry-run o --apply.
No utiliza la capa Último Sismo ni interpreta OBJECTID como código estable.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.igp.client import (
    IGPFeedError, IGPQueryResult, IGPUnavailable, IGP_REPORTS, normalize,
)


def fetch_igp_year_2026(
    *, page_size: int = 200, max_pages: int = 100, client: httpx.Client | None = None,
) -> IGPQueryResult:
    """Leer todas las páginas existentes de 2026 con límites y orden estable.

    La fecha de cada sismo se normaliza con America/Lima en `normalize`.
    Una fila inválida se documenta, nunca se completa con datos inventados.
    No afirmar cobertura completa si ArcGIS deja de responder o cambia su contrato.
    """
    if not 1 <= page_size <= 500 or not 1 <= max_pages <= 100:
        raise ValueError("page_size debe ser 1–500 y max_pages 1–100")
    if client is None:
        with httpx.Client(timeout=httpx.Timeout(20.0), follow_redirects=False) as session:
            return fetch_igp_year_2026(page_size=page_size, max_pages=max_pages, client=session)

    records: dict[str, dict[str, Any]] = {}
    skips: list[str] = []
    seen_features = 0
    seen_page_ids: set[tuple[str, ...]] = set()
    offset = 0

    for _ in range(max_pages):
        params = {
            "where": "code LIKE '2026-%'",
            "outFields": "*", "returnGeometry": "true", "outSR": "4326",
            "f": "json", "resultRecordCount": str(page_size),
            "resultOffset": str(offset), "orderByFields": "objectid ASC",
        }
        try:
            response = client.get(IGP_REPORTS, params=params)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise IGPUnavailable("No se pudo descargar una página IGP 2026") from exc
        if not isinstance(payload, dict) or "error" in payload or not isinstance(payload.get("features"), list):
            raise IGPUnavailable("El IGP devolvió una página con formato inválido")
        features = payload["features"]
        if not features:
            if offset == 0:
                raise IGPFeedError("No se encontraron reportes IGP de 2026; revisar contrato")
            return IGPQueryResult(list(records.values()), total=seen_features, skipped=skips)

        # No aceptar paginación repetida: podría perder o duplicar páginas.
        signature = tuple(str((f.get("attributes") or {}).get("objectid")) for f in features if isinstance(f, dict))
        if signature in seen_page_ids:
            raise IGPUnavailable("ArcGIS devolvió una página repetida; backfill no fiable")
        seen_page_ids.add(signature)
        seen_features += len(features)
        for feature in features:
            attrs = feature.get("attributes", {}) if isinstance(feature, dict) else {}
            if not isinstance(attrs, dict):
                attrs = {}
            code = attrs.get("code")
            try:
                # Verificación explícita: el filtro remoto puede cambiar.
                if not isinstance(code, str) or not code.startswith("2026-"):
                    raise IGPFeedError("Código de reporte fuera de 2026")
                record = normalize(feature, "recent")
            except IGPFeedError as exc:
                safe_id = "".join(c for c in str(code or "sin_codigo") if c.isascii() and (c.isalnum() or c in "-_"))[:32]
                skips.append(f"{safe_id}: {exc}")
                continue
            records[record["external_id"]] = record

        offset += len(features)
        if len(features) < page_size and not payload.get("exceededTransferLimit", False):
            return IGPQueryResult(list(records.values()), total=seen_features, skipped=skips)

    # Nunca terminar con un «éxito» si se alcanzó el límite de seguridad.
    raise IGPUnavailable("Se alcanzó max_pages antes de completar 2026")
