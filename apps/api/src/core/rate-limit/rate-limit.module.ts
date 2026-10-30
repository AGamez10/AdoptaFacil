import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScaleRateLimitGuard } from './scale-rate-limit.guard';

/** Plan de escala (B6): global per-IP and per-organization budgets. */
@Module({
  providers: [{ provide: APP_GUARD, useClass: ScaleRateLimitGuard }],
})
export class RateLimitModule {}
