#!/usr/bin/env python3
"""
Organiza los documentos que están directamente dentro de docs/.

Uso desde Git Bash, en la raíz del proyecto:
    python tools/organizar_docs.py          # Simula y muestra los movimientos.
    python tools/organizar_docs.py --apply  # Ejecuta los movimientos.

Solo mueve archivos .md y .csv de docs/. No borra archivos ni toca
apps/, services/, database/, tests/ u otras carpetas.
"""

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"


def revision_number(filename: str, pattern: str):
    """Extrae el número de revisión indicado en el nombre del archivo."""
    match = re.search(pattern, filename, flags=re.IGNORECASE)
    return int(match.group(1)) if match else None


def classify(filename: str):
    """Devuelve la carpeta de destino para un documento conocido."""
    name = filename.upper()

    # Resultados y archivos tabulares.
    if filename.lower().endswith(".csv") or name.startswith("COMPARACION_IGP"):
        return "04-datos-y-resultados/comparaciones"
    if name.startswith("CONTEOS_ANUALES_"):
        return "04-datos-y-resultados/comparaciones"
    if name.startswith("INFORME_CATALOGO_"):
        return "04-datos-y-resultados/informes"

    # Documentación general del proyecto.
    if name.startswith("DESPLIEGUE_"):
        return "00-proyecto"

    # Fases del proyecto. Se evalúa antes que la integración IGP para que
    # los documentos FASE_8_IGP_* permanezcan dentro de la fase 8.
    phase = re.match(r"FASE_(\d+)", name)
    if phase:
        return f"01-fases/fase-{int(phase.group(1))}"

    # Integración, consulta y sincronización con el IGP.
    if name.startswith(("IGP_", "INTEGRACION_IGP_")):
        return "02-integracion-igp"

    # Documentos transversales y de módulos sin una secuencia de revisiones.
    if name.startswith("CIERRE_MODELOS_ML_"):
        return "03-modulos/modelos-ml"
    if name.startswith("DIAGNOSTICO_CALIDAD_DATASETS_"):
        return "03-modulos/calidad-datasets"
    if name.startswith("MAPA_SISMICO_"):
        return "03-modulos/mapa-sismico"
    if name.startswith("CENTRO_ALERTAS_FASE_"):
        return "03-modulos/centro-alertas"
    if name == "CENTRO_ALERTAS_ENTREGAS_COLORES_02.MD":
        return "03-modulos/centro-alertas"
    if name == "CALIDAD_DATASET_IGP_HISTORICO_02.MD":
        return "03-modulos/calidad-datasets"
    if name == "REVISION_MODALES_COMPARTIDOS_01.MD":
        return "03-modulos/componentes-compartidos"
    if name == "REVISION_USUARIOS_ROLES_01.MD":
        return "03-modulos/usuarios-roles"

    # Revisiones numeradas: la última revisión conocida queda en el módulo;
    # las anteriores se conservan en el histórico correspondiente.
    revision_rules = [
        (r"ANALISIS_HISTORICO_REVISION_(\d+)", 4, "analisis-historico"),
        (r"MODELOS_ML_IGP_REVISION_(\d+)", 10, "modelos-ml"),
        (r"EVENTOS_SISMICOS_UNIFICACION_(\d+)", 3, "eventos-sismicos"),
        (r"REVISION_ALERTAS_NOTIFICACIONES_(\d+)", 2, "centro-alertas"),
        (r"REVISION_AUDITORIA_(\d+)", 6, "auditoria"),
        (r"REVISION_DASHBOARD_(\d+)", 3, "dashboard"),
        (r"REVISION_FUENTES_DATOS_(\d+)", 2, "fuentes-datos"),
        (r"REVISION_MAPA_(\d+)", 9, "mapa-sismico"),
        (r"REVISION_REPORTES_(\d+)", 4, "reportes"),
        (r"COMPONENTE_COMPARTIDO_CARGA_(\d+)", 2, "componentes-compartidos"),
    ]

    for pattern, latest, module in revision_rules:
        number = revision_number(name, pattern)
        if number is not None:
            if number == latest:
                # La revisión especial de interfaz se trata más abajo.
                return f"03-modulos/{module}"
            return f"99-historico/revisiones-anteriores/{module}"

    # La revisión de interfaz más reciente tiene sufijo FIX_01.
    if name == "INTERFAZ_GLOBAL_REVISION_02_FIX_01.MD":
        return "03-modulos/interfaz-global"
    if name.startswith("INTERFAZ_GLOBAL_REVISION_"):
        return "99-historico/revisiones-anteriores/interfaz-global"

    # Calidad de datasets: REVISION_03 es la revisión actual.
    if name == "CALIDAD_DATASETS_IGP_REVISION_03.MD":
        return "03-modulos/calidad-datasets"
    if name.startswith("CALIDAD_DATASETS_IGP_"):
        return "99-historico/revisiones-anteriores/calidad-datasets"

    # Ajuste de entregas anterior; se conserva en el histórico.
    if name == "CENTRO_ALERTAS_ENTREGAS_AJUSTE_01.MD":
        return "99-historico/revisiones-anteriores/centro-alertas"

    return None


def main():
    parser = argparse.ArgumentParser(
        description="Organiza docs/ de forma segura; por defecto solo simula."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Ejecuta los movimientos. Sin esta opción no modifica archivos.",
    )
    args = parser.parse_args()

    if not DOCS.is_dir():
        print(f"ERROR: no se encontró la carpeta {DOCS}")
        print("Ubica este script en <proyecto>/tools/organizar_docs.py.")
        return 1

    plan = []
    unclassified = []

    # Solo se examinan archivos directamente dentro de docs/, no subcarpetas.
    for source in sorted(DOCS.iterdir()):
        if not source.is_file() or source.suffix.lower() not in {".md", ".csv"}:
            continue
        destination_folder = classify(source.name)
        if destination_folder is None:
            unclassified.append(source.name)
            continue
        destination = DOCS / destination_folder / source.name
        plan.append((source, destination))

    # Validar todos los destinos antes de mover el primer archivo.
    conflicts = [
        (src, dst) for src, dst in plan
        if dst.exists()
    ]
    if conflicts:
        print("Hay archivos que ya existen en los destinos. No se movió nada:")
        for src, dst in conflicts:
            print(f"  - {src.name} -> {dst.relative_to(ROOT)}")
        print("Revisa los destinos manualmente y vuelve a ejecutar el script.")
        return 2

    print("ORGANIZACIÓN DE DOCUMENTACIÓN")
    print(f"Proyecto: {ROOT}")
    print(f"Modo: {'APLICAR CAMBIOS' if args.apply else 'SIMULACIÓN'}")
    print(f"Documentos identificados: {len(plan)}")
    print(f"Archivos sin regla (quedarán intactos): {len(unclassified)}")
    print()

    for source, destination in plan:
        print(f"{source.relative_to(ROOT)}")
        print(f"  -> {destination.relative_to(ROOT)}")

    if args.apply:
        for source, destination in plan:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(destination))
        print()
        print(f"Finalizado: {len(plan)} archivos movidos. No se eliminó ninguno.")
        print("Revisa el resultado con:")
        print("  git status --short")
        print("  git diff --check")
    else:
        print()
        print("Simulación terminada: no se modificó ningún archivo.")
        print("Si el plan es correcto, ejecuta:")
        print("  python tools/organizar_docs.py --apply")

    if unclassified:
        print()
        print("Archivos no clasificados; permanecen en docs/ sin cambios:")
        for filename in unclassified:
            print(f"  - {filename}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
