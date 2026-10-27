/** Navegación responsiva y perfil desplegable; colores semánticos en index.css. */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, BellRing, ChevronDown, ChevronRight, LogOut, Menu, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../hooks/useTheme';
import { AnalyticsProvider } from '../hooks/useAnalyticsFilters';
import { navigation } from '../lib/navigation';
import { displayRole } from '../lib/roleLabels';

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  const { profile, logout } = useAuth();
  // Breadcrumb derivado del mismo catálogo que alimenta el sidebar.
  const location = useLocation();
  const activeModule = navigation.find(item => item.path === location.pathname);
  const sectionLabel = activeModule?.section === 'gestion' ? 'Administración' : 'Exploración';

  // Permite cerrar el menú con Escape o al pulsar fuera, también en móvil.
  useEffect(() => {
    if (!profileOpen) return;
    function closeOnOutside(event: PointerEvent) {
      if (event.target instanceof Node && !profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileOpen(false);
        profileMenuRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileOpen]);

  return (
    <div className="min-h-screen bg-page text-main transition-colors lg:flex">
      {menuOpen && (
        <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMenuOpen(false)} />
      )}
      {/* La barra lateral conserva los accesos permitidos según el perfil. */}
      <aside className={`${menuOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-sidebar text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0`}>
        <div className="border-b border-white/10 px-5 py-6">
          <Link to="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-sidebar-active text-sidebar-active-text"><Activity size={22} /></span>
            <span><strong className="block text-sm tracking-wide">SISMO PLATFORM</strong><span className="text-xs text-sidebar-muted">Monitoreo · Perú</span></span>
          </Link>
        </div>
        <nav aria-label="Módulos principales" className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
          {(['general', 'gestion'] as const).map((section) => (
            <div key={section}>
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-muted">
                {section === 'general' ? 'Exploración' : 'Administración'}
              </p>
              <div className="space-y-1">
                {navigation.filter((item) => item.section === section && (
                  !['/usuarios-roles', '/auditoria'].includes(item.path) || ['administrador', 'auditor'].includes(profile?.role ?? '')
                )).map((item) => (
                  <NavLink key={item.path} to={item.path} end={item.path === '/'} onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${isActive ? 'bg-sidebar-active font-semibold text-sidebar-active-text ring-1 ring-sidebar-active' : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white'}`}>
                    <item.icon size={18} strokeWidth={1.8} /><span className="flex-1">{item.label}</span><ChevronRight size={14} className="opacity-35" />
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
            <button type="button" onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-muted hover:bg-panel-alt lg:hidden" aria-label="Abrir menú"><Menu size={20} /></button>
            <nav aria-label="Ubicación del módulo" className="flex min-w-0 items-center gap-2 text-sm">
              <span className="shrink-0 text-muted">{sectionLabel}</span>
              <ChevronRight size={15} className="shrink-0 text-soft" aria-hidden="true" />
              <strong className="truncate text-main" aria-current="page">{activeModule?.label ?? 'Página no encontrada'}</strong>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* El botón muestra únicamente el nombre; el rol se revela al abrir el perfil. */}
            <div ref={profileMenuRef} className="relative">
              <button type="button" aria-haspopup="menu" aria-expanded={profileOpen} aria-controls="menu-perfil"
                onClick={() => setProfileOpen((value) => !value)}
                className="inline-flex h-10 max-w-[158px] items-center gap-2 rounded-lg border border-border-ui bg-panel px-2.5 text-sm font-medium text-main transition-colors hover:bg-panel-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:max-w-[220px] sm:px-3">
                <UserRound size={18} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 truncate">{profile?.full_name ?? 'Mi perfil'}</span>
                <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${profileOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {profileOpen && (
                <div id="menu-perfil" role="menu" aria-label="Mi cuenta" className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border-ui bg-panel p-2 shadow-xl">
                  <div className="border-b border-border-ui px-3 py-3">
                    <p className="text-sm font-semibold text-main">{profile?.full_name ?? 'Usuario'}</p>
                    <p className="mt-0.5 break-all text-xs text-muted">{profile?.email}</p>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-soft">Rol asignado</p>
                    <p className="mt-1 text-sm font-medium text-main">{displayRole(profile?.role)}</p>
                  </div>
                  <Link role="menuitem" to="/mis-notificaciones" onClick={() => setProfileOpen(false)}
                    className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-main transition-colors hover:bg-panel-alt">
                    <BellRing size={17} className="text-muted"/> Mis notificaciones
                  </Link>
                  <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); void logout(); }}
                    className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-main transition-colors hover:bg-panel-alt focus-visible:outline-2 focus-visible:outline-accent">
                    <LogOut size={17} className="text-muted" aria-hidden="true" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
            <button type="button" aria-label={dark ? 'Activar tema claro' : 'Activar tema oscuro'} aria-pressed={dark}
              title={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} onClick={toggleTheme}
              className="inline-flex size-10 items-center justify-center rounded-lg border border-border-ui bg-panel text-accent transition-colors hover:bg-panel-alt">
              {dark ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9"><AnalyticsProvider><Outlet /></AnalyticsProvider></main>
        <footer className="px-5 pb-7 text-center text-xs text-soft sm:px-8">Datos pendientes de sincronización · Sistema independiente, no oficial</footer>
      </div>
    </div>
  );
}
