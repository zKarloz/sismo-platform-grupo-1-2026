"""Regresiones del instalador global 02 sobre el popup real del Mapa sísmico.

Se puede ejecutar desde la raíz: python -m pytest tests/frontend/test_interfaz_global_02_instalador.py -q
No requiere servicios externos ni modifica los archivos del repositorio.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'tools' / 'apply_global_ui_map_02.py'
MAP = ROOT / 'apps/web/src/modules/mapa-sismico/Page.tsx'


def load_installer():
    spec = importlib.util.spec_from_file_location('ui_global_02', SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def legacy_map(new_map: str, space_before_slash: bool) -> str:
    """Reconstruye el enlace antiguo en una copia de la página ya corregida."""
    tag = '<ExternalLink size={12} />' if space_before_slash else '<ExternalLink size={12}/>'
    old_link = ("{event.source_url?.startsWith('https://') && "
                '<a href={event.source_url} target="_blank" rel="noopener noreferrer" '
                'className="inline-flex items-center gap-1 font-medium text-blue-700">'
                f'Ver fuente oficial {tag}</a>' + '}')
    updated_link = ('{reportUrl && <a href={reportUrl} target="_blank" rel="noopener noreferrer" '
                    'className="inline-flex items-center gap-1 font-medium text-accent hover:underline">'
                    'Ver reporte específico IGP <ExternalLink size={12}/></a>}')
    assert updated_link in new_map
    assert 'const reportUrl = individualIGPReport(event.external_id, event.source_url);' in new_map
    return (new_map
            .replace(updated_link, old_link, 1)
            .replace("import { individualIGPReport } from '../../lib/igpReportUrl';\n", '', 1)
            .replace('  // Enlazar solo reportes individuales IGP identificados de forma válida.\n', '', 1)
            .replace('  const reportUrl = individualIGPReport(event.external_id, event.source_url);\n', '', 1)
            .replace('className="sismo-base-tiles" ', '', 4))


@pytest.mark.parametrize('space_before_slash', [True, False])
def test_detecta_ambos_formatos_de_icono(space_before_slash):
    installer = load_installer()
    text = legacy_map(MAP.read_text(encoding='utf-8'), space_before_slash)
    modified = installer.update_map(text)
    assert 'href={reportUrl}' in modified
    assert 'href={event.source_url}' not in modified
    assert modified.count('const reportUrl = individualIGPReport(') == 1
    assert 'className="sismo-base-tiles"' in modified
    assert installer.update_map(modified) == modified


def test_rechaza_el_enlace_desconocido_en_lugar_de_inventar_url():
    installer = load_installer()
    text = legacy_map(MAP.read_text(encoding='utf-8'), True)
    text = text.replace('Ver fuente oficial', 'Ver portal', 1)
    with pytest.raises(ValueError, match='enlace original'):
        installer.update_map(text)


def test_preserva_contornos_y_marcadores():
    installer = load_installer()
    text = legacy_map(MAP.read_text(encoding='utf-8'), True)
    modified = installer.update_map(text)
    for token in ('<Polygon', '<Circle center=', '<ClusteredMarkers', 'pointInDepartment'):
        assert token in modified
