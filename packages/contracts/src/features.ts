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
}

/** Everything off: the web's fallback when the capabilities document cannot
 *  be loaded (fail closed). */
export const CLOSED_CAPABILITIES: PublicCapabilities = {
  features: {
    payments: false,
    sponsorships: false,
    donationCertificates: false,
    community: false,
    reputation: false,
    resources: false,
    marketplace: false,
    volunteeringMinors: false,
  },
  googleSignIn: false,
};
