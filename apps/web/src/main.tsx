/** Inicialización React; sin datos de ejemplo para indicadores sísmicos. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root');
createRoot(root).render(<StrictMode><App /></StrictMode>);
