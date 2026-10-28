/** Rutas base: cada módulo vive en su carpeta para desarrollarse de forma aislada. */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './AppLayout';
import {RequireRole, RequireSession} from '../auth/ProtectedRoute';
import LoginPage from '../modules/login/LoginPage';
import SetPasswordPage from '../modules/login/SetPasswordPage';
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

export const router = createBrowserRouter([{ path: '/login', element: <LoginPage /> },
  { path: '/establecer-clave', element: <SetPasswordPage /> }, {
  path: '/', element: <RequireSession><AppLayout /></RequireSession>,
  children: [
    { index: true, element: <DashboardPage /> },
    { path: 'eventos', element: <EventosPage /> },
    { path: 'eventos/historico', element: <EventosPage /> },
    // Mantener los enlaces históricos guardados, sin duplicar una entrada en el menú.
    { path: 'historico-igp', element: <Navigate to="/eventos/historico" replace /> },
    { path: 'mapa-sismico', element: <MapaPage /> },
    { path: 'analisis', element: <AnalisisPage /> },
    { path: 'calidad-datos', element: <CalidadPage /> },
    { path: 'modelos-ml', element: <ModelosPage /> },
    // Las tres URLs muestran el mismo módulo, pero conservan la pestaña al recargar.
    { path: 'alertas', element: <AlertasPage /> },
    { path: 'alertas/reglas', element: <AlertasPage /> },
    { path: 'alertas/entregas', element: <AlertasPage /> },
    // El antiguo módulo de preferencias no tiene ruta: solo el Centro de alertas
    // administra destinatarios y umbrales de correo desde las reglas.
    { path: 'fuentes-datos', element: <FuentesPage /> },
    { path: 'reportes', element: <ReportesPage /> },
    { element: <RequireRole roles={['administrador', 'auditor']} />, children: [
      { path: 'usuarios-roles', element: <UsuariosPage /> },
      { path: 'auditoria', element: <AuditoriaPage /> },
    ]},
    { path: '*', element: <div className="rounded-2xl border border-border-ui bg-panel p-8"><h1 className="text-xl font-bold text-main">Página no encontrada</h1><p className="mt-2 text-muted">Revisa el menú lateral para volver a un módulo.</p></div> },
  ],
}]);
