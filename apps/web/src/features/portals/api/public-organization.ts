import type { OrganizationPublic } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function requestPublicOrganization(slug: string): Promise<OrganizationPublic | null> {
  const response = await fetch(`${API_BASE}/public/organizations/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as OrganizationPublic;
}

/** Cuerpo crudo de `GET /public/organizations/:slug/theme` (lo sanea la página), o null. */
async function requestPublicTheme(slug: string): Promise<unknown> {
  const response = await fetch(
    `${API_BASE}/public/organizations/${encodeURIComponent(slug)}/theme`,
  );
  return response.ok ? ((await response.json()) as unknown) : null;
}

/** Pedidos adelantados al abrir `/o/:slug` directo (ver `startPortalEarlyFetch`). */
const early = new Map<string, Promise<OrganizationPublic | null>>();
const earlyTheme = new Map<string, Promise<unknown>>();

/**
 * Al entrar directo a un portal (`/o/:slug`, el enlace que comparten los
 * refugios), pide la organización y su portada MIENTRAS el navegador todavía
 * baja el código de la página, en vez de esperar a que la página se pinte.
 * En un celular con 4G lento eso adelanta la portada (el LCP del portal) más
 * de medio segundo. Se usa una sola vez: los reintentos piden de nuevo.
 */
export function startPortalEarlyFetch(pathname: string): void {
  const match = /^\/o\/([^/]+)\/?$/.exec(pathname);
  if (!match) return;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return;
  }
  const request = requestPublicOrganization(slug);
  // Sin `catch` aquí la falla quedaría "sin atender": la página la ve igual al tomarla.
  request.catch(() => undefined);
  early.set(slug, request);
  const theme = requestPublicTheme(slug);
  theme.catch(() => undefined);
  earlyTheme.set(slug, theme);
  void request.then(
    (org) => {
      const cover = org?.coverPhotos?.[0];
      if (!cover) return;
      const image = new Image();
      (image as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'high';
      image.src = cover;
    },
    () => undefined,
  );
}

/**
 * Proyección PÚBLICA de una organización por slug (§M14) — `GET
 * /public/organizations/:slug`, sin auth. La misma que consume `OrgPublicPage`.
 * Devuelve `null` en un 404 (slug inexistente o portal no publicado) y lanza
 * solo ante un error real de red/servidor.
 */
export function fetchPublicOrganization(slug: string): Promise<OrganizationPublic | null> {
  const pending = early.get(slug);
  if (pending) {
    early.delete(slug);
    return pending;
  }
  return requestPublicOrganization(slug);
}

/**
 * Diseño público del portal (`GET /public/organizations/:slug/theme`): el
 * cuerpo sin sanear, o null si no hay. Usa el pedido adelantado si existe.
 */
export function fetchPublicThemeBody(slug: string): Promise<unknown> {
  const pending = earlyTheme.get(slug);
  if (pending) {
    earlyTheme.delete(slug);
    return pending;
  }
  return requestPublicTheme(slug);
}
