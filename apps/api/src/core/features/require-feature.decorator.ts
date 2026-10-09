import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '@adoptafacil/contracts';

export const REQUIRED_FEATURES_KEY = 'requiredFeatures';

/**
 * Gate a controller (or a single handler) behind module feature flags (R1-1).
 * When any listed feature is off, {@link FeatureFlagGuard} answers 404 before
 * authentication runs, so a switched-off module is indistinguishable from a
 * route that does not exist. Handler-level features add to the class ones.
 */
export const RequireFeature = (...features: FeatureKey[]) =>
  SetMetadata(REQUIRED_FEATURES_KEY, features);
