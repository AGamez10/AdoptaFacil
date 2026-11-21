/**
 * Pure resolver for real portal subdomains (F-1, M14): given the CURRENT
 * browser hostname and the configured base domain (`VITE_PORTAL_BASE_DOMAIN`),
 * decides whether the app is being served from an organization's own
 * subdomain (`<subdomain>.<baseDomain>`) — and if so, extracts the label.
 *
 * Every other host resolves to `null` — including the bare base domain itself,
 * reserved infrastructure labels (`www`, `app`, `api`, `admin`, `staging`), and
 * anything that doesn't end in the base domain at all (localhost, staging
 * preview URLs, IP addresses). `null` means "render the app exactly as
 * today" — no subdomain routing kicks in.
 */

const RESERVED_LABELS = new Set(['www', 'app', 'api', 'admin', 'staging']);

/** `hostname` from `window.location`; `baseDomain` from `VITE_PORTAL_BASE_DOMAIN`
 *  (unset in dev/staging by default — subdomain detection then never triggers). */
export function resolveOrgSubdomain(
  hostname: string,
  baseDomain: string | undefined,
): string | null {
  if (!baseDomain) return null;

  const host = hostname.trim().toLowerCase();
  const base = baseDomain.trim().toLowerCase();
  if (!host || !base || host === base) return null;

  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;

  const label = host.slice(0, -suffix.length);
  // Nested subdomains (e.g. "a.b.<base>") aren't a supported shape yet —
  // treat them as "not a portal subdomain" rather than guessing which label
  // is the organization's.
  if (!label || label.includes('.') || RESERVED_LABELS.has(label)) return null;

  return label;
}

/**
 * ¿El host actual es el dominio propio de una organización (plan Pro)? Sí
 * cuando no es el dominio de AdoptaFácil (`VITE_APP_DOMAIN`) ni uno de sus
 * subdominios, ni localhost ni una IP. Sin `VITE_APP_DOMAIN` (desarrollo,
 * pruebas) nunca: la app se ve como siempre. Pura.
 */
export function isCustomPortalHost(hostname: string, appDomain: string | undefined): boolean {
  const app = appDomain?.trim().toLowerCase();
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!app || !host) return false;
  if (host === app || host.endsWith(`.${app}`)) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false;
  return host.includes('.');
}

/** Dominio de los subdominios de portal; sin él, los portales viven en `/o/<slug>`. */
const PORTAL_BASE_DOMAIN = import.meta.env.VITE_PORTAL_BASE_DOMAIN as string | undefined;

/**
 * La dirección real que abre "Ver portal público": el subdominio solo cuando
 * está configurado (producción con `VITE_PORTAL_BASE_DOMAIN`); si no, la ruta
 * `/o/<slug>` del sitio donde se está editando (p. ej. dev.adoptafacil.org).
 */
export function portalAddress(
  slug: string,
  baseDomain: string | undefined = PORTAL_BASE_DOMAIN,
  host: string = typeof window === 'undefined' ? 'adoptafacil.org' : window.location.host,
): string {
  const base = baseDomain?.trim();
  return base ? `${slug}.${base}` : `${host}/o/${slug}`;
}
