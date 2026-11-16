/**
 * Auditoría run-2 R-05: `extendedContact.mapUrl` se muestra en el portal
 * público como el enlace "Ver en mapa" (y, si es de Google Maps, como iframe
 * reconstruido en el cliente). El servidor ya exigía http(s); ahora además
 * exige que el enlace sea de un servicio de mapas, para que el portal de una
 * fundación no pueda llevar a sus visitantes a un sitio cualquiera (phishing
 * con la marca de la fundación). La web aplica la misma lista a los hosts de
 * Google (`apps/web/src/features/portals/model/google-maps.ts`, GOOGLE_TLDS):
 * si cambia una, cambia la otra.
 */
const GOOGLE_TLDS = [
  'com',
  'com.co',
  'co',
  'com.mx',
  'com.ar',
  'cl',
  'com.pe',
  'com.ec',
  'com.ve',
  'com.br',
  'es',
  'co.uk',
  'us',
] as const;

const MAP_HOSTS: ReadonlySet<string> = new Set([
  ...GOOGLE_TLDS.flatMap((tld) => [`google.${tld}`, `www.google.${tld}`, `maps.google.${tld}`]),
  // Enlaces cortos que comparte la app de Google Maps desde el celular.
  'maps.app.goo.gl',
  'goo.gl',
  // Otros servicios de mapas que una fundación puede usar.
  'www.openstreetmap.org',
  'openstreetmap.org',
  'osm.org',
  'maps.apple.com',
  'waze.com',
  'www.waze.com',
  'ul.waze.com',
  'www.bing.com',
  'bing.com',
]);

export const MAP_URL_MESSAGE =
  'El enlace del mapa debe ser de Google Maps, OpenStreetMap, Waze, Apple Maps o Bing Maps.';

/** ¿Es un enlace a un servicio de mapas conocido (host EXACTO, sin credenciales)? */
export function isAllowedMapUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (!MAP_HOSTS.has(host)) return false;
  // En los dominios generales de Google y Bing solo la sección de mapas.
  if (/^(www\.)?google\./.test(host)) return url.pathname.startsWith('/maps');
  if (host === 'goo.gl') return url.pathname.startsWith('/maps');
  if (host.endsWith('bing.com')) return url.pathname.startsWith('/maps');
  return true;
}
