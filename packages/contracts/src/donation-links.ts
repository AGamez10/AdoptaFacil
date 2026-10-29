// Module: M15 payments · enlace y QR de donación por organización · Contracts owner: @fabian
//
// Design: docs/pagos/pasarelas-multiples.md (ADR-PAG-002, §QR).
//
// Every organization gets ONE stable donation URL that its community can scan
// from a printed QR. The URL must survive gateway changes (it points to
// AdoptaFácil, never to a gateway link), so a sticker printed today keeps
// working when the org switches gateways or adds methods.
//
// Browser-safe, dependency-free.

/** Path of the donation page inside an organization's portal. */
export const ORG_DONATE_PATH = '/donar';

export interface DonationLinkOrg {
  /** Real portal subdomain label (`patitas` in `patitas.adoptafacil.org`). */
  subdomain?: string | null;
  /** Portal slug (`/o/:slug`), always resolvable on the main domain. */
  slug?: string | null;
}

export interface DonationLinkEnv {
  /** Origin of the main web app, e.g. `https://adoptafacil.org`. */
  appOrigin: string;
  /** `VITE_PORTAL_BASE_DOMAIN`; unset until the wildcard DNS exists. */
  portalBaseDomain?: string | null;
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function cleanLabel(value: string | null | undefined): string | null {
  const label = value?.trim().toLowerCase();
  return label && LABEL.test(label) ? label : null;
}

/**
 * The organization's stable donation URL, or `null` when it has neither a
 * subdomain nor a slug yet (the UI then asks the org to set one).
 *
 *  - subdomain + base domain configured → `https://<sub>.<base>/donar`
 *  - otherwise, with a slug            → `<appOrigin>/o/<slug>/donar`
 *
 * Both routes render the same page, so switching from the slug URL to the
 * subdomain URL never breaks a QR that is already printed.
 */
export function buildOrganizationDonateUrl(
  org: DonationLinkOrg,
  env: DonationLinkEnv,
): string | null {
  const base = env.portalBaseDomain
    ?.trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');
  const subdomain = cleanLabel(org.subdomain);
  if (subdomain && base) return `https://${subdomain}.${base}${ORG_DONATE_PATH}`;

  const slug = cleanLabel(org.slug);
  if (!slug) return null;
  const origin = env.appOrigin.trim().replace(/\/+$/, '');
  return `${origin}/o/${slug}${ORG_DONATE_PATH}`;
}
