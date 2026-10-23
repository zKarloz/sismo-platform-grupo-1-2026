/** Rutas base: cada módulo vive en su carpeta para desarrollarse de forma aislada. */
import { createBrowserRouter } from 'react-router-dom';
import AppLayout from './AppLayout';
import DashboardPage from '../modules/dashboard/DashboardPage';
import EventosPage from '../modules/eventos/Page';
import MapaPage from '../modules/mapa-sismico/Page';
import AnalisisPage from '../modules/analisis/Page';
import CalidadPage from '../modules/calidad-datos/Page';
import ModelosPage from '../modules/modelos-ml/Page';
import AlertasPage from '../modules/alertas/Page';
import FuentesPage from '../modules/fuentes-datos/Page';
import ReportesPage from '../modules/reportes/Page';
import UsuariosPage from '../modules/usuarios-roles/Page';
import AuditoriaPage from '../modules/auditoria/Page';

export const router = createBrowserRouter([{
  path: '/', element: <AppLayout />,
  children: [
    { index: true, element: <DashboardPage /> },
    { path: 'eventos', element: <EventosPage /> },
    { path: 'mapa-sismico', element: <MapaPage /> },
    { path: 'analisis', element: <AnalisisPage /> },
    { path: 'calidad-datos', element: <CalidadPage /> },
    { path: 'modelos-ml', element: <ModelosPage /> },
    { path: 'alertas', element: <AlertasPage /> },
    { path: 'fuentes-datos', element: <FuentesPage /> },
    { path: 'reportes', element: <ReportesPage /> },
    { path: 'usuarios-roles', element: <UsuariosPage /> },
    { path: 'auditoria', element: <AuditoriaPage /> },
    { path: '*', element: <div className="rounded-2xl border border-border-ui bg-panel p-8"><h1 className="text-xl font-bold text-main">Página no encontrada</h1><p className="mt-2 text-muted">Revisa el menú lateral para volver a un módulo.</p></div> },
  ],
}]);
