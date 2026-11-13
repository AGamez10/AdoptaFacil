// Module: core/features (Ola 1, R1-1) · Contracts owner: @sebastian
//
// Module feature flags and the public capabilities document the web reads to
// decide what to show. A module that is off is hidden in the web AND answers
// 404 in the API — hiding it in the UI alone is not enough. Every flag is OFF
// unless the server says otherwise; the web fails closed when it cannot read
// this document.

/** Feature keys, one per module (or sub-capability) that can be switched off. */
export const FEATURE_KEYS = [
  'payments',
  'sponsorships',
  'donationCertificates',
  'community',
  /** Muro de publicaciones de Comunidad. Solo se enciende si `community`
   *  también lo está, para que el directorio pueda salir sin el muro. */
  'communityWall',
  'reputation',
  'resources',
  'marketplace',
  'volunteeringMinors',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureFlags = Record<FeatureKey, boolean>;

/** `GET /public/config/features` — public, no auth, no tenant data. */
export interface PublicCapabilities {
  features: FeatureFlags;
  /** Whether `POST /auth/google` is served (a real or, outside production, a
   *  fake identity adapter is bound). */
  googleSignIn: boolean;
  /** OAuth Client ID (web) the API verifies Google ID tokens against, sent
   *  only when the real adapter is bound (`AUTH_IDENTITY_DRIVER=google`). It
   *  is public by design (Google Identity Services puts it in every page that
   *  shows the button), and publishing it here means the web always uses the
   *  SAME Client ID the API checks the token audience with, without having to
   *  duplicate it in `VITE_GOOGLE_CLIENT_ID` and rebuild. */
  googleClientId?: string;
}

/** Shape of a Google OAuth web Client ID. Anything else is ignored. */
export const GOOGLE_CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

/** Everything off: the web's fallback when the capabilities document cannot
 *  be loaded (fail closed). */
export const CLOSED_CAPABILITIES: PublicCapabilities = {
  features: {
    payments: false,
    sponsorships: false,
    donationCertificates: false,
    community: false,
    communityWall: false,
    reputation: false,
    resources: false,
    marketplace: false,
    volunteeringMinors: false,
  },
  googleSignIn: false,
};
