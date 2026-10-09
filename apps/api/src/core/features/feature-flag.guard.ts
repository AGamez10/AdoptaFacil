import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import type { FeatureFlags, FeatureKey } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { readFeatureFlags } from './feature-flags';
import { REQUIRED_FEATURES_KEY } from './require-feature.decorator';

/**
 * Global guard (APP_GUARD) for module feature flags (R1-1). Global guards run
 * before controller-level guards, so a switched-off module answers 404 to
 * everyone — anonymous, authenticated or platform staff — without revealing
 * that the route exists: the body is the same one Nest sends for an unknown
 * route. Routes without {@link RequireFeature} are untouched.
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  private readonly flags: FeatureFlags;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    this.flags = readFeatureFlags(config);
  }

  canActivate(context: ExecutionContext): boolean {
    const onClass =
      this.reflector.get<FeatureKey[] | undefined>(REQUIRED_FEATURES_KEY, context.getClass()) ?? [];
    const onHandler =
      this.reflector.get<FeatureKey[] | undefined>(REQUIRED_FEATURES_KEY, context.getHandler()) ??
      [];
    for (const feature of [...onClass, ...onHandler]) {
      if (!this.flags[feature]) {
        const request = context.switchToHttp().getRequest<Request>();
        throw new NotFoundException(`Cannot ${request.method} ${request.originalUrl}`);
      }
    }
    return true;
  }
}
