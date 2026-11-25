/**
 * Servicios de push web a los que la API acepta enviar avisos. La URL de una
 * suscripción la elige el navegador, pero llega en el cuerpo de una petición:
 * sin esta lista, cualquiera con sesión podría hacer que la API abra conexiones
 * hacia un destino arbitrario (SSRF, hallazgo AF-N04), incluso servicios internos.
 *
 * Se aceptan solo `https`, puerto 443, sin usuario/contraseña en la URL y con un
 * host que sea, o termine en, uno de estos dominios de los navegadores:
 * - Chrome, Edge (Chromium), Opera, Samsung, Android: Firebase Cloud Messaging.
 * - Firefox: Mozilla Push Service.
 * - Safari (macOS 13+, iOS 16.4+): Apple Push Notification service.
 * - Edge heredado / Windows: Windows Push Notification Services.
 */
const PUSH_HOST_SUFFIXES: readonly string[] = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.port !== '' && url.port !== '443') return false;
  if (url.username !== '' || url.password !== '') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
