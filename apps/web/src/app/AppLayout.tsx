/** Navegación y apariencia responsiva; todos los colores de interfaz vienen de index.css. */
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Activity, ChevronRight, Menu, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { AnalyticsProvider } from '../hooks/useAnalyticsFilters';
import { navigation } from '../lib/navigation';

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';

  return (
    <div className="min-h-screen bg-page text-main transition-colors lg:flex">
      {menuOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Sidebar: el color de fondo y los estados se controlan con variables de tema. */}
      <aside className={`${menuOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-sidebar text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0`}>
        <div className="border-b border-white/10 px-5 py-6">
          <Link to="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-sidebar-active text-sidebar-active-text"><Activity size={22} /></span>
            <span>
              <strong className="block text-sm tracking-wide">SISMO PLATFORM</strong>
              <span className="text-xs text-sidebar-muted">Monitoreo · Perú</span>
            </span>
          </Link>
        </div>
        <nav aria-label="Módulos principales" className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
          {(['general', 'gestion'] as const).map((section) => (
            <div key={section}>
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-muted">
                {section === 'general' ? 'Exploración' : 'Administración'}
              </p>
              <div className="space-y-1">
                {navigation.filter((item) => item.section === section).map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${isActive ? 'bg-sidebar-active font-semibold text-sidebar-active-text ring-1 ring-sidebar-active' : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white'}`}
                  >
                    <item.icon size={18} strokeWidth={1.8} />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight size={14} className="opacity-35" />
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex gap-3 rounded-xl border border-white/10 bg-sidebar-hover p-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-sidebar-active-text" />
            <p className="text-xs leading-5 text-sidebar-muted">Plataforma informativa. No emite alertas oficiales ni predicciones.</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border-ui bg-panel/95 px-5 backdrop-blur transition-colors sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-2 text-muted hover:bg-panel-alt lg:hidden"
              aria-label="Abrir menú"
            ><Menu size={20} /></button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-main">Sistema de Monitoreo Sísmico</p>
              <p className="text-xs text-soft">Entorno de desarrollo · Fase 5</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-border-ui bg-panel-alt px-3 py-1.5 text-xs font-medium text-muted sm:flex">
              <span className="size-2 rounded-full bg-accent" /> Uso interno
            </div>
            <button
              type="button"
              aria-label={dark ? 'Activar tema claro' : 'Activar tema oscuro'}
              aria-pressed={dark}
              title={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
              onClick={toggleTheme}
              className="inline-flex size-10 items-center justify-center rounded-xl border border-border-ui bg-panel text-accent transition-colors hover:bg-panel-alt"
            >
              {dark ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9"><AnalyticsProvider><Outlet /></AnalyticsProvider></main>
        <footer className="px-5 pb-7 text-center text-xs text-soft sm:px-8">
          Datos pendientes de sincronización · Sistema independiente, no oficial
        </footer>
      </div>
    </div>
  );
}
