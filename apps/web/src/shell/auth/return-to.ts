/**
 * Retorno a la intención. Quien llega desde una campaña, un voluntariado o
 * cualquier otra ruta y necesita cuenta vuelve a ESA ruta después de entrar o
 * registrarse, no al inicio general.
 *
 * Dos vías, las dos validadas aquí:
 *  - `state.from` que deja `RequireAuth` cuando bloquea una ruta protegida.
 *  - `?returnTo=` en `/login` y `/register`, que ponen los enlaces públicos.
 *
 * Seguridad (sin open redirect): solo rutas internas. Se rechazan URLs
 * absolutas, rutas de red (`//host`), barras invertidas, caracteres de control
 * y las pantallas de acceso mismas (evita bucles).
 */

/** Pantallas de acceso: volver a una de ellas no tiene sentido. */
const ACCESS_PATHS: ReadonlySet<string> = new Set([
  '/login',
  '/register',
  '/forgot',
  '/reset-password',
]);

const MAX_RETURN_LENGTH = 2048;
const SAFE_BASE = 'https://adoptafacil.invalid';

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Devuelve la ruta interna segura, o null si no lo es. */
export function safeReturnTo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_RETURN_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw.includes('\\') || hasControlChar(raw)) return null;

  let resolved: URL;
  try {
    resolved = new URL(raw, SAFE_BASE);
  } catch {
    return null;
  }
  if (resolved.origin !== SAFE_BASE) return null;
  if (ACCESS_PATHS.has(resolved.pathname)) return null;
  return raw;
}

/** Ruta de acceso que lleva la intención consigo, p. ej. `/login?returnTo=…`. */
export function accessPathWithReturn(
  route: '/login' | '/register',
  returnTo: string | null | undefined,
): string {
  const safe = safeReturnTo(returnTo);
  return safe ? `${route}?returnTo=${encodeURIComponent(safe)}` : route;
}

/** Ruta actual (con su query) como intención de retorno. */
export function returnPathOf(location: { pathname: string; search: string }): string {
  return `${location.pathname}${location.search}`;
}
