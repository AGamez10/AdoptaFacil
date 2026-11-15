// Primero: en la demo por túnel, los enlaces a archivos no apuntan a localhost.
import './dev-file-urls';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@adoptafacil/ui/styles.css';
import './index.css';
import { installImageRetry } from './lib/image-retry';
import { Shell } from './shell';

// Una foto que falla porque la API aún no respondía se vuelve a pedir.
installImageRetry();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>,
);
