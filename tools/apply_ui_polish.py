"""Ajusta el layout y los scrollbars sin sobrescribir los archivos actuales.

Uso (raíz del repositorio): python tools/apply_ui_polish.py
El script es idempotente y genera copias de seguridad antes de escribir.
"""
from __future__ import annotations

from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
LAYOUT = ROOT / 'apps/web/src/app/AppLayout.tsx'
CSS = ROOT / 'apps/web/src/index.css'
ML_PAGE = ROOT / 'apps/web/src/modules/modelos-ml/Page.tsx'
BACKUP = ROOT / '.ui-polish-backups'

STYLE_MARKER = '/* UI_POLISH_01: scrollbars y punteros accesibles. */'
STYLE = '''
/* UI_POLISH_01: scrollbars y punteros accesibles. */
/* La clase se aplica solo a contenedores desplazables, sin modificar los gráficos. */
.ui-thin-scrollbar {
  scrollbar-width: thin; /* Firefox */
  scrollbar-color: var(--ui-border) transparent;
}
.ui-thin-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
.ui-thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
.ui-thin-scrollbar::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background-color: var(--ui-border);
}
.ui-thin-scrollbar::-webkit-scrollbar-thumb:hover { background-color: var(--ui-muted); }
/* Puntero de interacción para controles habilitados en todos los módulos. */
button:not(:disabled), a[href], select:not(:disabled), summary,
[role="button"]:not([aria-disabled="true"]),
input[type="checkbox"]:not(:disabled), input[type="radio"]:not(:disabled) {
  cursor: pointer;
}
button:disabled, select:disabled, [role="button"][aria-disabled="true"] {
  cursor: not-allowed;
}
'''


def update_layout(source: str) -> str:
    """Transformaciones localizadas: evita reemplazar navegación o autenticación."""
    out = source
    # El lateral adopta la superficie del encabezado y su borde semántico.
    if 'flex-col bg-sidebar text-white transition-transform' in out:
        out = out.replace(
            'flex-col bg-sidebar text-white transition-transform',
            'flex-col border-r border-border-ui bg-panel text-main transition-transform',
            1,
        )
    elif 'flex-col border-r border-border-ui bg-panel text-main transition-transform' not in out:
        raise ValueError('No se reconoció la superficie del sidebar; no se modifica AppLayout.')

    out = out.replace('border-white/10', 'border-border-ui')
    out = out.replace('hover:text-white', 'hover:text-main')

    if 'ui-thin-scrollbar' not in out:
        # Limitar la clase al nav del sidebar, no al contenido general.
        out, count = re.subn(
            r'(<nav\s+aria-label="Módulos principales"\s+className=")([^"]*\boverflow-y-auto\b)',
            r'\1ui-thin-scrollbar \2',
            out,
            count=1,
        )
        if count != 1:
            raise ValueError('No se localizó el contenedor desplazable del sidebar.')

    # La cuenta en pantallas pequeñas se representa como icono accesible.
    trigger = 'onClick={() => setProfileOpen((value) => !value)}'
    if trigger not in out:
        raise ValueError('No se localizó el botón de usuario.')
    start = out.index(trigger)
    match = re.search(r'className="([^"]+)"', out[start: start + 650])
    if not match:
        raise ValueError('No se encontró el estilo del botón de usuario.')
    orig = match.group(0)
    if 'ui-profile-trigger' not in orig:
        classes = match.group(1)
        # Elimina las restricciones antiguas de anchura móvil antes de añadir
        # la variante compacta. Mantiene las clases de foco y hover existentes.
        classes = re.sub(r'\bmax-w-\[158px\]\b', '', classes)
        classes = classes.replace('max-w-[158px]', '')
        classes = classes.replace('sm:max-w-[220px]', '')
        classes = classes.replace('sm:px-3', '')
        classes = classes.replace('px-2.5', '')
        classes = ('ui-profile-trigger size-10 justify-center px-0 sm:h-10 '
                   'sm:w-auto sm:max-w-[220px] sm:justify-start sm:px-3 ' + classes)
        classes = re.sub(r'\s+', ' ', classes).strip()
        abs_pos = start + match.start()
        out = out[:abs_pos] + f'className="{classes}"' + out[start + match.end():]
    # Añadir texto accesible; el nombre queda visualmente oculto solo en móvil.
    if 'aria-label="Abrir menú de usuario"' not in out:
        out = out.replace('type="button" aria-haspopup="menu"', 'type="button" aria-label="Abrir menú de usuario" aria-haspopup="menu"', 1)
    out = out.replace(
        '<span className="min-w-0 truncate">{profile?.full_name ?? \'Mi perfil\'}</span>',
        '<span className="hidden min-w-0 truncate sm:inline">{profile?.full_name ?? \'Mi perfil\'}</span>',
    )
    out = out.replace(
        'shrink-0 text-muted transition-transform ${profileOpen',
        'hidden shrink-0 text-muted transition-transform sm:block ${profileOpen',
    )

    # Mantener el menú montado permite ejecutar también la animación de salida.
    conditional = '{profileOpen && (\n                <div id="menu-perfil"'
    if conditional in out:
        out = out.replace(conditional, '<div id="menu-perfil"', 1)
        old = '              )}\n            </div>\n            <button'
        if old not in out:
            raise ValueError('No se pudo encontrar el cierre condicional del menú.')
        out = out.replace(old, '            </div>\n            <button', 1)
    elif 'id="menu-perfil"' not in out:
        raise ValueError('No se encontró el menú de cuenta.')

    # Manipular únicamente la etiqueta del menú para no afectar otros overlays.
    if 'className={`ui-profile-popover ' in out:
        return out  # Idempotencia: la animación ya fue aplicada.
    pat = re.compile(r'(<div id="menu-perfil"[^>]*?)(className="[^"]+")(?=>)')
    def menu_replacer(m: re.Match[str]) -> str:
        attrs = m.group(1)
        if 'aria-hidden={!profileOpen}' not in attrs:
            attrs += 'aria-hidden={!profileOpen} '
        class_attr = m.group(2)
        if 'ui-profile-popover' in class_attr:
            return attrs + class_attr
        old_class = class_attr[len('className="'):-1]
        new_class = (
            'ui-profile-popover ' + old_class +
            ' origin-top-right transform transition-all duration-200 ease-out '
            'motion-reduce:transition-none '
        )
        # Sustituimos el atributo estático por una cadena con clases dinámicas.
        return (attrs + 'className={`' + new_class +
                '${profileOpen ? "visible translate-y-0 scale-100 opacity-100" : "invisible pointer-events-none -translate-y-1 scale-95 opacity-0"}`}')
    out, n = pat.subn(menu_replacer, out, count=1)
    if n != 1:
        raise ValueError('No se reconoció la etiqueta de menú de perfil.')
    return out


def update_css(source: str) -> str:
    out = source
    # Tokens para que los elementos interiores del sidebar tengan contraste
    # sobre la misma superficie que el topbar, en ambos temas.
    tokens = {
        '--ui-sidebar': 'var(--ui-panel)',
        '--ui-sidebar-muted': 'var(--ui-muted)',
        '--ui-sidebar-active': 'var(--ui-accent-soft)',
        '--ui-sidebar-active-text': 'var(--ui-accent)',
        '--ui-sidebar-hover': 'var(--ui-panel-alt)',
    }
    for name, value in tokens.items():
        pattern = r'(^\s*' + re.escape(name) + r':)\s*[^;]+;'
        out, n = re.subn(pattern, lambda m: m.group(1) + ' ' + value + ';', out, flags=re.M)
        if n < 2:
            raise ValueError(f'No se encontraron los tokens claro/oscuro para {name}.')
    if STYLE_MARKER not in out:
        out = out.rstrip() + '\n' + STYLE
    return out


def update_ml_page(source: str) -> str:
    """Scrollbar pequeño en todas las tablas desplazables de Modelos ML."""
    def add_class(m: re.Match[str]) -> str:
        classes = m.group(2)
        if 'ui-thin-scrollbar' not in classes:
            classes += ' ui-thin-scrollbar'
        return m.group(1) + classes + m.group(3)
    out, count = re.subn(
        r'(<div\s+className=")([^"]*\boverflow-x-auto\b[^"]*)(")',
        add_class, source,
    )
    if count < 2:
        raise ValueError('No se identificaron las tablas desplazables de Modelos ML.')
    return out


def main() -> None:
    paths = [LAYOUT, CSS, ML_PAGE]
    for p in paths:
        if not p.is_file():
            raise SystemExit(f'Falta el archivo necesario: {p.relative_to(ROOT)}')
    original = {p: p.read_text(encoding='utf-8') for p in paths}
    try:
        modified = {
            LAYOUT: update_layout(original[LAYOUT]),
            CSS: update_css(original[CSS]),
            ML_PAGE: update_ml_page(original[ML_PAGE]),
        }
    except ValueError as exc:
        raise SystemExit(f'Parche no aplicado: {exc}\nComparte el AppLayout.tsx e index.css actuales para adaptarlo.')
    pending = [p for p in paths if original[p] != modified[p]]
    if not pending:
        print('Ajustes ya aplicados; no se necesitan cambios.')
        return
    BACKUP.mkdir(exist_ok=True)
    for path in pending:
        relative = path.relative_to(ROOT)
        backup = BACKUP / relative
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            shutil.copy2(path, backup)
        path.write_text(modified[path], encoding='utf-8')
        print('Actualizado:', relative)
    print('Respaldos en .ui-polish-backups/. No se modificaron API ni datos.')


if __name__ == '__main__':
    main()
