import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FeatureFlagGuard } from './feature-flag.guard';
import { FeaturesController } from './features.controller';

/** Module feature flags (Ola 1, R1-1): global 404 guard + public capabilities. */
@Global()
@Module({
  controllers: [FeaturesController],
  providers: [{ provide: APP_GUARD, useClass: FeatureFlagGuard }],
})
export class FeaturesModule {}
