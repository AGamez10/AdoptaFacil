import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { Env } from '../../config/env.validation';
import {
  PUBLIC_RATE_LIMITS,
  PublicApiThrottlerGuard,
  type PublicRateLimits,
} from './public-api-throttler.guard';
import { BotVerifier } from './verified-bots';

/** Rate limit of the anonymous `/public/*` API with verified search crawlers. */
@Module({
  providers: [
    { provide: BotVerifier, useFactory: () => new BotVerifier() },
    {
      provide: PUBLIC_RATE_LIMITS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PublicRateLimits => ({
        ip: config.get('PUBLIC_RATE_LIMIT_PER_MINUTE', { infer: true }),
        bot: config.get('PUBLIC_RATE_LIMIT_BOT_PER_MINUTE', { infer: true }),
      }),
    },
    { provide: APP_GUARD, useClass: PublicApiThrottlerGuard },
  ],
})
export class BotsModule {}
