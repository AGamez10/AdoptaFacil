import { useEffect, useState } from 'react';
import { isCustomPortalHost, resolveOrgSubdomain } from './model/subdomain';
import {
  fetchOrganizationSlugByCustomDomain,
  fetchOrganizationSlugBySubdomain,
} from './api/organization-by-subdomain';

export type PortalSubdomainState =
  /** Not on an organization subdomain (bare domain, www/app/localhost, a
   *  staging preview URL, or `VITE_PORTAL_BASE_DOMAIN` unset) — render the
   *  app exactly as it renders today; `/o/:slug` remains the fallback route. */
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; slug: string }
  /** A real-shaped subdomain, but no organization has it configured. */
  | { status: 'not-found' };

/**
 * Resolves the CURRENT browser host to an organization slug when the app is
 * being served from that organization's real portal subdomain (F-1, M14).
 * The subdomain itself is derived once (a host change is a full page
 * reload, never a client-side transition), then resolved to a slug through
 * `GET /public/organizations/by-subdomain/:subdomain` — after which the
 * caller reuses every existing slug-keyed public page/component unchanged.
 */
export function usePortalSubdomainSlug(): PortalSubdomainState {
  // Read fresh on every call (never cached at module scope): `import.meta.env`
  // is a live object in dev/test, and this keeps the hook trivially testable
  // via `vi.stubEnv` without needing `vi.resetModules()`/a dynamic re-import.
  const subdomain = resolveOrgSubdomain(
    window.location.hostname,
    import.meta.env.VITE_PORTAL_BASE_DOMAIN as string | undefined,
  );
  // Dominio propio de una organización Pro (www.turefugio.org): todo host que
  // no sea de AdoptaFácil. Se resuelve igual, a un slug.
  const customHost =
    !subdomain &&
    isCustomPortalHost(
      window.location.hostname,
      import.meta.env.VITE_APP_DOMAIN as string | undefined,
    )
      ? window.location.hostname
      : null;
  const [state, setState] = useState<PortalSubdomainState>(
    subdomain || customHost ? { status: 'loading' } : { status: 'none' },
  );

  useEffect(() => {
    if (!subdomain && !customHost) return;
    let active = true;
    (subdomain
      ? fetchOrganizationSlugBySubdomain(subdomain)
      : fetchOrganizationSlugByCustomDomain(customHost as string)
    )
      .then((slug) => {
        if (active) setState(slug ? { status: 'ready', slug } : { status: 'not-found' });
      })
      .catch(() => {
        if (active) setState({ status: 'not-found' });
      });
    return () => {
      active = false;
    };
    // `subdomain` only changes with a full navigation (new hostname ⇒ new
    // page load), so this effect intentionally runs once per mount.
  }, [subdomain, customHost]);

  return state;
}
