// Primero: en la demo por túnel, los enlaces a archivos no apuntan a localhost.
import './dev-file-urls';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@adoptafacil/ui/styles.css';
import './index.css';
import { installImageRetry } from './lib/image-retry';
import { registerServiceWorker } from './lib/pwa';
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

// PWA: instalable desde el navegador y con pantalla sin conexión (ver public/sw.js).
// Se registra cuando la página ya cargó; si el evento `load` ya pasó, ahora mismo.
if (document.readyState === 'complete') {
  void registerServiceWorker();
} else {
  window.addEventListener('load', () => void registerServiceWorker(), { once: true });
}
