import cookieParser from 'cookie-parser';
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.validation';
import { REDIS_CLIENT } from '../../redis/redis.service';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { PasswordService } from './password.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { TokenService } from './token.service';

/**
 * M02 authentication. Registers a GLOBAL JwtModule (so the tenant middleware and
 * the guard can verify access tokens anywhere) and a per-IP throttler used by
 * the auth controller. The counters live in Redis (THROTTLER_STORAGE=redis,
 * required in production, Ola 1 R1-3) so the budget is shared across
 * instances and restarts; 'memory' keeps the per-process store for tests.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({ secret: loadAuthConfig().jwtSecret }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService<Env, true>, redis: Redis) => ({
        throttlers: [{ ttl: 60_000, limit: 20 }],
        storage:
          config.get('THROTTLER_STORAGE', { infer: true }) === 'redis'
            ? new RedisThrottlerStorage(redis)
            : undefined,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: loadAuthConfig },
    PasswordService,
    TokenService,
    AuthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
  ],
  exports: [AUTH_CONFIG, JwtAuthGuard, OptionalJwtAuthGuard],
})
export class AuthModule implements NestModule {
  // Only the `auth` routes read a cookie (the silent-refresh bootstrap) — no
  // need to parse cookies app-wide for every other module's requests.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes('auth');
  }
}
