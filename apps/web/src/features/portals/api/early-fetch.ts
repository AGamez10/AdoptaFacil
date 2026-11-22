/**
 * Peticiones tempranas del portal y de la ficha (velocidad, LCP móvil).
 *
 * Sin esto, la portada de un portal se pintaba al final de una cadena: bajar
 * el JS principal → ejecutarlo → bajar la ruta diferida → leer los módulos
 * encendidos → pedir el perfil y el tema → pintar. `main.tsx` llama a
 * `startEarlyPortalFetches` antes de montar React, así el perfil, el tema y la
 * ficha viajan en paralelo con todo lo demás. La respuesta sirve durante unos
 * segundos (`takeEarlyFetch`); si nadie la toma, no pasa nada. Solo GET públicos,
 * sin credenciales: los mismos que la pantalla pediría de todos modos.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
/** Tras este tiempo se pide de nuevo: el dato temprano ya no es «de ahora». */
const EARLY_TTL_MS = 15_000;

const early = new Map<string, { response: Promise<Response>; at: number }>();

const SLUG = '([a-z0-9]+(?:-[a-z0-9]+)*)';
const PORTAL_PATH = new RegExp(`^/o/${SLUG}/?$`);
const ANIMAL_PATH = new RegExp(`^/o/${SLUG}/animales/([^/]+)/?$`);
const PUBLIC_CODE = /^[0-9a-hjkmnp-tv-z]{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const portalProfileUrl = (slug: string) =>
  `${API_BASE}/public/organizations/${encodeURIComponent(slug)}`;
export const portalThemeUrl = (slug: string) => `${portalProfileUrl(slug)}/theme`;
export const publicAnimalUrl = (slug: string, ref: string) =>
  `${portalProfileUrl(slug)}/animals/${encodeURIComponent(ref)}`;

function start(url: string) {
  const response = fetch(url);
  // Un fallo de red se maneja donde se consuma; aquí solo se evita el aviso.
  response.catch(() => undefined);
  early.set(url, { response, at: Date.now() });
}

/** Ref de la ficha en la URL ("luna-k7m2qp8x" → código; UUID viejo tal cual). */
function animalRef(segment: string): string | null {
  const value = decodeURIComponent(segment).trim().toLowerCase();
  if (UUID.test(value)) return value;
  const code = value.slice(value.lastIndexOf('-') + 1);
  return PUBLIC_CODE.test(code) ? code : null;
}

export function startEarlyPortalFetches(pathname: string): void {
  const portal = PORTAL_PATH.exec(pathname);
  if (portal?.[1]) {
    start(portalProfileUrl(portal[1]));
    start(portalThemeUrl(portal[1]));
    return;
  }
  const animal = ANIMAL_PATH.exec(pathname);
  if (animal?.[1] && animal[2]) {
    const ref = animalRef(animal[2]);
    if (ref) start(publicAnimalUrl(animal[1], ref));
    start(portalProfileUrl(animal[1]));
  }
}

/**
 * La petición temprana de `url` si es reciente. Cada quien recibe su propia
 * copia (`clone`): la pantalla puede montarse dos veces mientras arranca la
 * sesión y ambas aprovechan la misma respuesta, sin pedirla de nuevo.
 */
export function takeEarlyFetch(url: string): Promise<Response> | undefined {
  const entry = early.get(url);
  if (!entry) return undefined;
  if (Date.now() - entry.at > EARLY_TTL_MS) {
    early.delete(url);
    return undefined;
  }
  return entry.response.then((response) => response.clone());
}

/** `fetch` que primero aprovecha la petición temprana. */
export function fetchEarlyOr(url: string, init?: RequestInit): Promise<Response> {
  return takeEarlyFetch(url) ?? fetch(url, init);
}
