/** Enrutador global para los diez módulos del monorepositorio. */
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AuthProvider } from '../auth/AuthProvider';

export default function App() { return <AuthProvider><RouterProvider router={router} /></AuthProvider>; }
