/**
 * Enlaces a archivos (fotos, logos, evidencias, "Ver soporte" de una rendición
 * de cuentas). La API los arma con STORAGE_PUBLIC_BASE_URL como
 * `<base>/storage/public?key=…`. En producción esa base es el dominio público
 * (`https://<dominio>/api`, y la guarda de la API rechaza localhost). En el
 * equipo de desarrollo vale `http://localhost:3000`, que solo existe en ese
 * equipo: abierta la demo por un túnel o desde otro dispositivo, el enlace
 * llevaba a "localhost". Aquí se reescribe sobre la base de la API que el
 * navegador sí alcanza (VITE_API_URL, p. ej. `/api` en el mismo origen).
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);

/** Ruta de servicio de archivos de la API (`/storage/public` o `/storage/private`). */
const SERVE_PATH = /\/storage\/(?:public|private)$/;

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOOPBACK_HOSTS.has(host) || host.endsWith('.localhost') || /^127\./.test(host);
}

function parse(raw: string, base: string): URL | null {
  try {
    return new URL(raw, base);
  } catch {
    return null;
  }
}

/**
 * Devuelve una URL de archivo que el navegador puede abrir.
 *
 * - Un archivo servido por una API en localhost, visto desde una página que
 *   llega a la API por otro host (túnel, otro equipo): se pasa a `apiBase`.
 * - `https://<dominio>/storage/public?…` cuando la API vive en
 *   `https://<dominio>/api` (faltaba el prefijo): se le pone.
 * - Cualquier otra URL (otro dominio, la API correcta, rutas que no son de
 *   archivos, valores que no son URL) queda igual.
 *
 * Pura: `apiBase` y `here` (la página actual) se pasan explícitos.
 */
export function reachableFileUrl(raw: string, apiBase: string, here: string): string {
  if (typeof raw !== 'string' || raw === '') return raw;
  const url = parse(raw, here);
  const api = parse(apiBase, here);
  if (!url || !api || !SERVE_PATH.test(url.pathname)) return raw;

  const prefix = api.pathname.replace(/\/+$/, '');
  const tail = url.pathname.slice(url.pathname.lastIndexOf('/storage/'));
  const target = `${api.origin}${prefix}${tail}${url.search}`;

  if (isLoopbackHost(url.hostname) && !isLoopbackHost(api.hostname)) return target;
  if (url.origin === api.origin && prefix !== '' && url.pathname === tail) return target;
  return raw;
}

/** Aplica `reachableFileUrl` a cada texto de una respuesta JSON (objetos y listas). */
export function rebaseFileUrls<T>(value: T, apiBase: string, here: string): T {
  if (typeof value === 'string') return reachableFileUrl(value, apiBase, here) as T;
  if (Array.isArray(value)) return value.map((v) => rebaseFileUrls(v, apiBase, here)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = rebaseFileUrls(v, apiBase, here);
    return out as T;
  }
  return value;
}

/**
 * URL para mostrar un archivo PÚBLICO recién subido. `uploadUrl` es el destino
 * de la subida que entrega la API (`<base>/storage/upload?key=…`); la de
 * mostrar es la misma base con `/storage/public`. Conserva el prefijo de la
 * base: con `https://<dominio>/api`, quedarse solo con el origen daba
 * `https://<dominio>/storage/public`, que en producción responde la web y no
 * el archivo.
 */
export function publicUrlFromUploadTarget(uploadUrl: string, key: string): string {
  const url = new URL(uploadUrl);
  const base = url.pathname.replace(/\/storage\/upload\/?$/, '').replace(/\/+$/, '');
  return `${url.origin}${base}/storage/public?key=${encodeURIComponent(key)}`;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Solo en desarrollo, y solo cuando la página habla con la API por un host
 * que no es localhost (demo por túnel): reescribe las URLs de archivos de cada
 * respuesta JSON de la API, así fotos, logos y "Ver soporte" abren en
 * cualquier dispositivo. En local normal y en producción no se instala.
 * Devuelve si quedó instalado.
 */
export function installDevFileUrlRebase(
  apiBase: string,
  win: Pick<Window, 'fetch' | 'location'> = window,
): boolean {
  const here = win.location.href;
  const api = parse(apiBase, here);
  if (!api || isLoopbackHost(api.hostname)) return false;
  const apiPrefix = `${api.origin}${api.pathname.replace(/\/+$/, '')}/`;
  const original = win.fetch.bind(win);

  win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    const target = parse(requestUrl(input), here);
    const type = res.headers.get('content-type') ?? '';
    if (
      !target ||
      !`${target.origin}${target.pathname}`.startsWith(apiPrefix) ||
      !type.includes('application/json') ||
      res.status === 204 ||
      !res.ok
    ) {
      return res;
    }
    const text = await res.text();
    let body = text;
    if (text.includes('/storage/')) {
      try {
        body = JSON.stringify(rebaseFileUrls(JSON.parse(text), apiBase, here));
      } catch {
        body = text;
      }
    }
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(body, { status: res.status, statusText: res.statusText, headers });
  };
  return true;
}
