"""Política de procedencia de los nuevos snapshots y vistas del laboratorio.

No modifica ni destruye datasets históricos de otras fuentes.
"""

IGP_SOURCE = "IGP/CENSIS"


def require_igp_source(source: str | None) -> str:
    """Valida la selección de la fuente; el CLI nunca acepta mezclas implícitas."""
    if source is not None and source.casefold() != IGP_SOURCE.casefold():
        raise ValueError("Solo se permiten nuevos datasets de fuente IGP/CENSIS")
    return IGP_SOURCE
