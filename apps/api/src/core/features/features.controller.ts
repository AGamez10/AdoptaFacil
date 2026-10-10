import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PublicCapabilities } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { readFeatureFlags } from './feature-flags';

/**
 * `GET /public/config/features` (R1-1): the public capabilities document the
 * web reads to hide switched-off modules and the Google button. Public and
 * tenant-free by design: it exposes booleans only, never a driver name,
 * credential or approval reference.
 */
@Controller('public/config')
export class FeaturesController {
  private readonly capabilities: PublicCapabilities;

  constructor(config: ConfigService<Env, true>) {
    this.capabilities = {
      features: readFeatureFlags(config),
      googleSignIn: config.get('AUTH_IDENTITY_DRIVER', { infer: true }) !== 'disabled',
    };
  }

  @Get('features')
  getFeatures(): PublicCapabilities {
    return this.capabilities;
  }
}
