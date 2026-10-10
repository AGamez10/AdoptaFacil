import type { FeatureKey } from '@adoptafacil/contracts';

/**
 * Web routes that belong to a switchable module (Ola 1, R1-1). One table
 * drives both the menu (an entry whose path is listed hides when its feature
 * is off) and the route gate (the page answers "not found", like the API's
 * 404). Paths match exactly or as a prefix followed by "/".
 */
const FEATURE_PATHS: ReadonlyArray<readonly [FeatureKey, readonly string[]]> = [
  ['payments', ['/donaciones', '/mis-donaciones', '/donaciones-recibidas']],
  // Donation certificates and their public verification (D9, SEC-003).
  ['donationCertificates', ['/certificado', '/verificar']],
  ['sponsorships', ['/apadrinar', '/organizacion/apadrinamientos']],
  ['resources', ['/recursos', '/ofrecer', '/mis-ofertas', '/organizacion/recursos']],
  ['marketplace', ['/marketplace', '/organizacion/marketplace']],
  ['community', ['/comunidad', '/mis-publicaciones', '/plataforma/comunidad']],
  ['reputation', ['/resenas', '/organizacion/resenas', '/plataforma/resenas']],
];

/** Public reviews page of an organization: /organizaciones/:slug/resenas. */
const ORG_REVIEWS_PATH = /^\/organizaciones\/[^/]+\/resenas\/?$/;

export function featureForPath(pathname: string): FeatureKey | null {
  for (const [feature, prefixes] of FEATURE_PATHS) {
    if (prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return feature;
    }
  }
  if (ORG_REVIEWS_PATH.test(pathname)) return 'reputation';
  return null;
}
