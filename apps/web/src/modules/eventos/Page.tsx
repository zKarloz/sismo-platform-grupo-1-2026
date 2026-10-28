/** Módulo unificado de eventos: una entrada de navegación y dos rutas recargables. */
import { NavLink, useLocation } from 'react-router-dom';
import EventCatalog from './EventCatalog';
import HistoricoIGP from '../historico-igp/Page';

export default function EventosPage() {
  // El estado de la pestaña se deriva de la URL, como en Centro de alertas.
  const { pathname } = useLocation();
  const historical = pathname.replace(/\/+$/, '').endsWith('/historico');
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${isActive ? 'border-b-2 border-accent text-main' : 'text-muted hover:text-main'}`;

  return <main className="space-y-5">
    <header>
      <h1 className="text-3xl font-bold text-main">Eventos sísmicos</h1>
      <p className="mt-2 text-sm text-muted">Consulta reportes registrados y el catálogo histórico oficial del IGP.</p>
    </header>
    <div className="flex flex-wrap gap-1 border-b border-border-ui" role="tablist" aria-label="Catálogos de eventos sísmicos">
      <NavLink to="/eventos" end role="tab" id="eventos-tab-actual" aria-selected={!historical}
        aria-controls="eventos-panel-actual" className={tabClass}>Eventos sísmicos</NavLink>
      <NavLink to="/eventos/historico" role="tab" id="eventos-tab-historico" aria-selected={historical}
        aria-controls="eventos-panel-historico" className={tabClass}>IGP histórico</NavLink>
    </div>
    {historical
      ? <section id="eventos-panel-historico" role="tabpanel" aria-labelledby="eventos-tab-historico"><HistoricoIGP /></section>
      : <section id="eventos-panel-actual" role="tabpanel" aria-labelledby="eventos-tab-actual"><EventCatalog /></section>}
  </main>;
}
