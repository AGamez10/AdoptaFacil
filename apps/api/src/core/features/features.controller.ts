import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GOOGLE_CLIENT_ID_PATTERN, type PublicCapabilities } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { readFeatureFlags } from './feature-flags';

/**
 * `GET /public/config/features` (R1-1): the public capabilities document the
 * web reads to hide switched-off modules and the Google button. Public and
 * tenant-free by design: it exposes booleans only, never a driver name,
 * credential or approval reference. The one string is the Google OAuth Client
 * ID, which is public (every page with the Google button carries it) and lets
 * the web use exactly the Client ID this API verifies tokens against.
 */
@Controller('public/config')
export class FeaturesController {
  private readonly capabilities: PublicCapabilities;

  constructor(config: ConfigService<Env, true>) {
    const driver = config.get('AUTH_IDENTITY_DRIVER', { infer: true });
    const clientId = config.get('GOOGLE_OAUTH_CLIENT_ID', { infer: true })?.trim();
    this.capabilities = {
      features: readFeatureFlags(config),
      googleSignIn: driver !== 'disabled',
      ...(driver === 'google' && clientId && GOOGLE_CLIENT_ID_PATTERN.test(clientId)
        ? { googleClientId: clientId }
        : {}),
    };
  }

  @Get('features')
  getFeatures(): PublicCapabilities {
    return this.capabilities;
  }
}
