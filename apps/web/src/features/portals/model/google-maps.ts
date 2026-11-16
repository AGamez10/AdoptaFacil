/**
 * Google Maps URL → embed URL (S2-REORG). Fixes the public portal's
 * "Información" iframe showing "refused to connect": Google Maps blocks
 * framing of its normal share/place URLs — only `/maps/embed?...` or
 * `?output=embed` URLs are embeddable. This is a best-effort, pure
 * string transform (no Maps API/key) — when it can't confidently produce an
 * embeddable URL, the caller falls back to a plain "Ver en mapa →" link
 * instead of risking another blocked iframe.
 */

/**
 * Security remediation `web/portals/google-maps-embed-host-suffix-bypass`: the
 * old end-anchored regexes accepted `maps.google.<attacker-domain>` (e.g.
 * `maps.google.evil.com`). Now the host must be one of Google's own Maps
 * domains, EXACTLY, and the iframe URL is always rebuilt on a fixed Google
 * host (never the raw input), so a lookalike can never reach the iframe.
 * TLDs: the global one plus Colombia and the usual neighbours of whoever
 * copies the link (a Maps link copied abroad keeps its local domain).
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
const GOOGLE_MAPS_EXACT_HOSTS: ReadonlySet<string> = new Set(
  GOOGLE_TLDS.flatMap((tld) => [`google.${tld}`, `www.google.${tld}`, `maps.google.${tld}`]),
);

/** Is this a google.com/maps or maps.google.com URL at all (https/http, a
 *  Google Maps host exactly, no credentials, default port)? */
export function isGoogleMapsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    if (!GOOGLE_MAPS_EXACT_HOSTS.has(host)) return false;
    return host.startsWith('maps.') || url.pathname.startsWith('/maps');
  } catch {
    return false;
  }
}

/** `/maps/place/Some+Place/@4.6,-74.1,15z` → "Some Place". */
function placeFromPath(pathname: string): string | null {
  const match = /\/maps\/place\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : null;
}

/** `/maps/@4.6,-74.1,15z` → "4.6,-74.1" (exact coordinates, not a guess). */
function coordsFromPath(pathname: string): string | null {
  const match = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(pathname);
  return match ? `${match[1]},${match[2]}` : null;
}

/**
 * Convert a Google Maps URL to an embeddable one, or `null` when it can't be
 * done with confidence (caller should show a link instead of an iframe).
 * - Already an embed URL (`/maps/embed` or `?output=embed`) → same query,
 *   rebuilt on a fixed Google host (never the raw input).
 * - A `?q=...` or a `/maps/place/<name>/...` URL → rebuilt as
 *   `https://maps.google.com/maps?q=<query>&output=embed`.
 * - A bare `/maps/@lat,lng,zoom` (no name/query) → rebuilt from the EXACT
 *   coordinates already in the URL (`?q=lat,lng&output=embed`) — this is not
 *   a guess, the location is fully specified by those two numbers.
 * - Anything else (e.g. a `maps.app.goo.gl`/`goo.gl` SHORT link from a phone's
 *   share sheet) → `null`. A short link carries no place/coordinate info in
 *   the URL itself — resolving it requires following its redirect, which (a)
 *   needs a network round trip this pure string transform intentionally
 *   avoids, and (b) would just land on Google's normal map page, which
 *   blocks framing anyway (the exact "refused to connect" bug this exists to
 *   fix). Falling back to "Ver en mapa →" here is the correct, honest
 *   behavior, not a bug — documented so it isn't mistaken for one twice.
 */
export function toGoogleMapsEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!isGoogleMapsUrl(raw)) return null;

  // Already embeddable: rebuilt on a FIXED Google host with the same query —
  // never the caller's raw URL (host, path tricks, credentials, fragment).
  if (url.pathname.startsWith('/maps/embed')) {
    const path = url.pathname.startsWith('/maps/embed/v1/') ? url.pathname : '/maps/embed';
    return `https://www.google.com${path}${url.search}`;
  }
  if (url.searchParams.get('output') === 'embed') {
    return `https://maps.google.com/maps${url.search}`;
  }

  const query =
    url.searchParams.get('q') ?? placeFromPath(url.pathname) ?? coordsFromPath(url.pathname);
  if (query) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  }
  return null;
}

/**
 * Mapa embebible a partir de la DIRECCIÓN en texto (sin API key): el mismo
 * endpoint `maps.google.com/maps?q=<dirección>&output=embed` que usa la
 * conversión de URLs. Sirve cuando la organización no cargó un enlace de Google
 * Maps (o cargó uno corto de "compartir", que no se puede embeber). Los extras
 * (ciudad, departamento, país) afinan la búsqueda; solo se usan los que existen
 * — nunca se inventa una dirección. Sin dirección → \`null\`.
 */
export function googleMapsEmbedFromAddress(
  address: string | undefined,
  ...extras: Array<string | undefined>
): string | null {
  const street = address?.trim();
  if (!street) return null;
  const query = [street, ...extras.map((part) => part?.trim())].filter(Boolean).join(', ');
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}
