/**
 * Registro del service worker de la PWA (`public/sw.js`).
 *
 * Solo en el build de producción: en desarrollo un service worker guardaría
 * archivos de Vite y confundiría la recarga en caliente. Si el navegador no
 * los soporta (o los bloquea, como el WebView de iOS fuera de dominios
 * autorizados), la app sigue funcionando igual: la PWA es una mejora, no un
 * requisito.
 */
export interface RegisterOptions {
  enabled?: boolean;
  nav?: Pick<Navigator, 'serviceWorker'> | undefined;
  url?: string;
}

export async function registerServiceWorker({
  enabled = import.meta.env.PROD,
  nav = typeof navigator === 'undefined' ? undefined : navigator,
  url = '/sw.js',
}: RegisterOptions = {}): Promise<ServiceWorkerRegistration | null> {
  if (!enabled || !nav || !('serviceWorker' in nav) || !nav.serviceWorker) return null;
  try {
    return await nav.serviceWorker.register(url, { scope: '/' });
  } catch {
    return null;
  }
}
