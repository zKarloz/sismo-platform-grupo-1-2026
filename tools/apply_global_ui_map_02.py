"""Revisión global 02: colores, carga de sesión y reportes del mapa.

Ejecutar desde la raíz: python tools/apply_global_ui_map_02.py
Solo modifica fragmentos conocidos, no sustituye páginas completas. Repetible.
Genera respaldos de los archivos editados. Falla antes de escribir si un
componente cambió de estructura o si faltan dependencias requeridas.
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = Path('apps/web/src/index.css')
LAYOUT = Path('apps/web/src/app/AppLayout.tsx')
GUARD = Path('apps/web/src/auth/ProtectedRoute.tsx')
MAP = Path('apps/web/src/modules/mapa-sismico/Page.tsx')
MAPCSS = Path('apps/web/src/modules/mapa-sismico/mapStyles.css')
SPINNER = Path('apps/web/src/components/ui/LoadingSpinner.tsx')
HELPER = Path('apps/web/src/lib/igpReportUrl.ts')
BACKUPS = ROOT / '.ui-polish-backups' / 'global-02'


def replace_once(text: str, old: str, new: str, where: str) -> str:
    """Sustituye exactamente una ancla; cualquier desviación exige revisión."""
    if old not in text:
        if new in text:
            return text  # Parche ya aplicado.
        raise ValueError(f'No se encontró la estructura esperada de {where}')
    if text.count(old) != 1:
        raise ValueError(f'Hay varias coincidencias inesperadas de {where}')
    return text.replace(old, new, 1)


def set_var(css: str, key: str, value: str) -> str:
    """Edita un token solo en el bloque :root correspondiente."""
    pattern = re.compile(rf'^[ \t]*{re.escape(key)}[ \t]*:[ \t]*[^;\n]+;', re.MULTILINE)
    line = f'  {key}: {value};'
    if pattern.search(css):
        return pattern.sub(line, css, count=1)
    return css.replace('  color-scheme: ', f'  {key}: {value};\n  color-scheme: ', 1)


def update_css(text: str) -> str:
    if '--color-shell: var(--ui-shell)' not in text:
        anchor = '  --color-sidebar: var(--ui-sidebar);'
        if anchor not in text:
            raise ValueError('No se reconocen los tokens Tailwind del layout')
        text = text.replace(anchor,
            '  /* Color compartido para las barras superior y lateral. */\n'
            '  --color-shell: var(--ui-shell);\n' + anchor, 1)

    # Partir temas, para evitar alterar accidentalmente las variables oscuras.
    if ':root.dark {' not in text or ':root {' not in text:
        raise ValueError('No se encuentran ambos temas en index.css')
    head, tail = text.split(':root {', 1)
    light, dark = tail.split(':root.dark {', 1)
    light = set_var(light, '--ui-shell', '#e9edf2')
    if '/* Cambia SOLO este hexadecimal' not in light:
        light = light.replace('  --ui-shell: #e9edf2;',
            '  /* Cambia SOLO este hexadecimal para ajustar el gris del topbar/sidebar. */\n  --ui-shell: #e9edf2;', 1)
    light = set_var(light, '--ui-sidebar', 'var(--ui-shell)')
    light = set_var(light, '--ui-sidebar-muted', '#475569')
    light = set_var(light, '--ui-sidebar-hover', '#dce4eb')
    light = set_var(light, '--ui-sidebar-active', '#d6e5ed')
    light = set_var(light, '--ui-sidebar-active-text', '#155e75')
    dark = set_var(dark, '--ui-shell', '#171717')
    dark = set_var(dark, '--ui-sidebar', 'var(--ui-shell)')
    return head + ':root {' + light + ':root.dark {' + dark


def update_layout(text: str) -> str:
    start = text.find('<aside className=')
    end = text.find('</aside>', start)
    if start < 0 or end < 0:
        raise ValueError('No se encontró el sidebar de AppLayout')
    before, aside, after = text[:start], text[start:end], text[end:]
    if 'bg-panel text-main transition-transform' in aside:
        aside = aside.replace('bg-panel text-main transition-transform',
                              'bg-shell text-main transition-transform', 1)
    elif 'bg-sidebar text-white transition-transform' in aside:
        aside = aside.replace('bg-sidebar text-white transition-transform',
                              'border-r border-border-ui bg-shell text-main transition-transform', 1)
        aside = aside.replace('border-white/10', 'border-border-ui').replace('hover:text-white', 'hover:text-main')
    elif 'bg-shell text-main transition-transform' not in aside:
        raise ValueError('No se identificó el color vigente del sidebar')
    text = before + aside + after
    header_start = text.find('<header className=')
    header_end = text.find('</header>', header_start)
    if header_start < 0 or header_end < 0:
        raise ValueError('No se encontró el topbar de AppLayout')
    before, header, after = text[:header_start], text[header_start:header_end], text[header_end:]
    # Solo la etiqueta <header>; los botones internos mantienen bg-panel-alt.
    opening, rest = header.split('>', 1)
    if 'bg-panel/95' in opening:
        opening = opening.replace('bg-panel/95', 'bg-shell', 1)
    elif 'bg-panel' in opening:
        opening = opening.replace('bg-panel', 'bg-shell', 1)
    elif 'bg-shell' not in opening:
        raise ValueError('No se identificó el fondo del topbar')
    return before + opening + '>' + rest + after


SESSION_CARD = '''if (loading) return (
    /* UI_GLOBAL_02: validación visual, nunca mostrar contenido protegido antes del perfil. */
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-10 text-main" aria-busy="true">
      <div className="w-full max-w-md rounded-2xl border border-border-ui bg-panel px-7 py-9 text-center shadow-sm sm:px-10 sm:py-11">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Activity size={27} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Monitoreo sísmico · Perú</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-main">Validando sesión</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Estamos verificando tu identidad y los permisos de acceso.</p>
        <LoadingSpinner size="lg" label="Verificando credenciales…" className="mt-7 text-accent" />
      </div>
    </div>
  );'''


def update_guard(text: str) -> str:
    if 'UI_GLOBAL_02:' in text:
        return text
    # Respetar el contrato original: la protección depende de useAuth().loading.
    match = re.search(r'if\s*\(loading\)\s*return\s*<div\b[^>]*>\s*Validando sesi[oó]n[^<]*</div>;', text)
    if not match:
        raise ValueError('No se reconoció la pantalla actual «Validando sesión»')
    text = text[:match.start()] + SESSION_CARD + text[match.end():]
    if "from '../components/ui/LoadingSpinner'" not in text:
        anchor = "import { useAuth } from './AuthProvider';"
        if anchor not in text:
            raise ValueError('No se encontró el import de useAuth')
        text = text.replace(anchor, anchor + "\nimport LoadingSpinner from '../components/ui/LoadingSpinner';\nimport { Activity } from 'lucide-react';", 1)
    return text


# Tolerar variaciones inocuas de formato TSX: <ExternalLink size={12} />
# o <ExternalLink size={12}/> son equivalentes, pero el parche 02 antiguo
# reconocía solamente la segunda escritura y detenía toda la instalación.
# La búsqueda se restringe a Epicenter() y solo admite el enlace conocido.
MAP_OLD_LINK_PATTERN = re.compile(
    r"\{\s*event\.source_url\?\.startsWith\(\s*['\"]https://['\"]\s*\)\s*&&\s*"
    r"<a\b[^>]*\bhref=\{event\.source_url\}[^>]*>\s*Ver fuente oficial\s*"
    r"<ExternalLink\s+size=\{12\}\s*/>\s*</a>\s*\}",
    re.DOTALL,
)
MAP_NEW_LINK = '''{reportUrl && <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">Ver reporte específico IGP <ExternalLink size={12}/></a>}'''


def update_map(text: str) -> str:
    """Reescribe solo el popup real del epicentro, respetando el resto."""
    start = text.find('function Epicenter(')
    end = text.find('function asLiveFeature(', start)
    if start < 0 or end < 0:
        raise ValueError('No se reconoció Epicenter() del mapa')

    before, body, after = text[:start], text[start:end], text[end:]
    if 'href={reportUrl}' not in body:
        body, count = MAP_OLD_LINK_PATTERN.subn(MAP_NEW_LINK, body)
        if count != 1:
            raise ValueError('No se identificó un único enlace original de la ficha de epicentro')
    if 'const reportUrl = individualIGPReport(' not in body:
        body = replace_once(
            body, '  const event = feature.properties;',
            '  const event = feature.properties;\n'
            '  // Enlazar solo reportes individuales IGP identificados de forma válida.\n'
            '  const reportUrl = individualIGPReport(event.external_id, event.source_url);',
            'propiedades de Epicenter',
        )
    text = before + body + after

    anchor = "import { IGP_OFFICIAL_URL, peruDate } from '../../services/igp';"
    helper_import = "import { individualIGPReport } from '../../lib/igpReportUrl';"
    if helper_import not in text:
        if anchor not in text:
            raise ValueError('No se encontró el import de los servicios IGP del mapa')
        text = text.replace(anchor, anchor + '\n' + helper_import, 1)

    # Evitar microseparaciones de mosaicos raster, sin afectar polígonos.
    old = '<TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"'
    new = '<TileLayer className="sismo-base-tiles" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"'
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise ValueError('No se identificó la capa OpenStreetMap')
    old, new = '<TileLayer url={mapTilerRaster(', '<TileLayer className="sismo-base-tiles" url={mapTilerRaster('
    if old in text:
        text = text.replace(old, new)
    elif new not in text and 'mapTilerRaster(' in text:
        raise ValueError('No se identificaron las capas opcionales MapTiler')
    return text


MAP_SEAM_FIX = '''
/* UI_GLOBAL_02: evitar pequeñas líneas entre mosaicos raster en ciertos
 * niveles de zoom o escalas de pantalla. El solapamiento ~0,6 px por lado
 * NO afecta a los polígonos, círculos ni contornos de los filtros. */
.sismo-leaflet-map .sismo-base-tiles img.leaflet-tile {
  scale: 1.005;
}
'''


def update_map_css(text: str) -> str:
    if 'UI_GLOBAL_02:' in text:
        return text
    return text.rstrip() + '\n' + MAP_SEAM_FIX


def main() -> None:
    if not (ROOT / 'apps/web/src').is_dir():
        raise SystemExit('Ejecuta el comando desde un repositorio que contenga apps/web/src')
    for rel in (LAYOUT, CSS, GUARD, MAP, MAPCSS, SPINNER, HELPER):
        if not (ROOT / rel).is_file():
            raise SystemExit(f'Falta {rel}; no se han modificado archivos.')
    transformations = {
        CSS: update_css,
        LAYOUT: update_layout,
        GUARD: update_guard,
        MAP: update_map,
        MAPCSS: update_map_css,
    }
    changed: dict[Path, str] = {}
    for rel, transform in transformations.items():
        old = (ROOT / rel).read_text(encoding='utf-8')
        new = transform(old)
        if old != new:
            changed[rel] = new
    if not changed:
        print('La revisión global 02 ya está aplicada. Sin cambios.'); return
    # Validar la transformación COMPLETA antes de escribir el primer archivo.
    for rel in changed:
        target = BACKUPS / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copy2(ROOT / rel, target)
    for rel, new in changed.items():
        (ROOT / rel).write_text(new, encoding='utf-8')
        print('Actualizado:', rel)
    print('Respaldo:', BACKUPS.relative_to(ROOT))
    print('Color claro editable en apps/web/src/index.css: --ui-shell: #e9edf2;')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as exc:
        raise SystemExit(f'Instalación detenida: {exc}') from exc
