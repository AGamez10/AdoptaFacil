import type { ConfigService } from '@nestjs/config';
import type { FeatureFlags, FeatureKey } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';

/** Env variable that switches each feature (all OFF unless exactly "true"). */
export const FEATURE_ENV_KEYS = {
  payments: 'FEATURE_PAYMENTS',
  sponsorships: 'FEATURE_SPONSORSHIPS',
  donationCertificates: 'FEATURE_DONATION_CERTIFICATES',
  community: 'FEATURE_COMMUNITY',
  reputation: 'FEATURE_REPUTATION',
  resources: 'FEATURE_RESOURCES',
  marketplace: 'FEATURE_MARKETPLACE',
  volunteeringMinors: 'FEATURE_VOLUNTEERING_MINORS',
} as const satisfies Record<FeatureKey, keyof Env>;

export function readFeatureFlags(config: ConfigService<Env, true>): FeatureFlags {
  const flags = {} as FeatureFlags;
  for (const [feature, envKey] of Object.entries(FEATURE_ENV_KEYS)) {
    flags[feature as FeatureKey] = config.get(envKey, { infer: true }) === true;
  }
  return flags;
}
