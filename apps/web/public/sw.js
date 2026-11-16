/* global self, caches */
/*
 * Service worker de AdoptaFácil (PWA).
 *
 * Objetivo: que la app se pueda instalar y que, sin conexión, muestre una
 * pantalla clara en vez del dinosaurio del navegador. Nada más.
 *
 * Reglas de seguridad (no relajar sin revisión):
 *  - Nunca se guardan respuestas de la API ni de otros orígenes: solo se
 *    interceptan peticiones GET del mismo origen, y nunca rutas /api/ ni /c/.
 *  - Nunca se guarda HTML: las páginas van siempre a la red (pueden traer datos
 *    de una sesión). Si la red falla al navegar, se muestra /offline.html.
 *  - Solo se guardan en caché los archivos con hash de /assets/ (inmutables)
 *    y los íconos, para que la app abra rápido.
 *
 * Al cambiar la estrategia, sube VERSION: el activate borra las cachés viejas.
 */
const VERSION = 'v1';
const PRECACHE = `af-precache-${VERSION}`;
const ASSETS = `af-assets-${VERSION}`;
const MAX_ASSETS = 80;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('af-') && key !== PRECACHE && key !== ASSETS)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/c/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok && response.type === 'basic') {
              const copy = response.clone();
              event.waitUntil(
                caches
                  .open(ASSETS)
                  .then((cache) => cache.put(request, copy))
                  .then(() => trim(ASSETS, MAX_ASSETS)),
              );
            }
            return response;
          }),
      ),
    );
  }
});
