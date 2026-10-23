/** Enrutador global para los diez módulos del monorepositorio. */
import { RouterProvider } from 'react-router-dom';
import { router } from './router';

export default function App() { return <RouterProvider router={router} />; }
