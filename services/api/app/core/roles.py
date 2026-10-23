"""Roles funcionales definidos en Fase 0; aplicar permisos reales en Fase 2."""

from enum import StrEnum


class UserRole(StrEnum):
    ADMINISTRADOR = "administrador"
    ANALISTA = "analista"
    OPERADOR_ALERTAS = "operador_alertas"
    AUDITOR = "auditor"
    SOLO_LECTURA = "solo_lectura"
