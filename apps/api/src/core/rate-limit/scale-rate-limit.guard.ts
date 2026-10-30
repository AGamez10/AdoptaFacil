import { createHash } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.validation';
import { REDIS_CLIENT } from '../../redis/redis.service';
import { RedisThrottlerStorage } from '../auth/redis-throttler.storage';
import { TenantContextService } from '../tenant/tenant-context.service';

const WINDOW_MS = 60_000;
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Public, anonymous read routes (behind Caddy's `/api` prefix strip). */
export function isPublicReadPath(path: string): boolean {
  return path.startsWith('/public/') || path === '/storage/public';
}

/**
 * Plan de escala (B6): two budgets every request passes, shared across replicas
 * through the same storage as the auth throttler (Redis in production).
 *
 * - Per client IP on public reads (`/public/*`, `/storage/public`):
 *   PUBLIC_RATE_LIMIT_PER_MIN. Stops a scraper from degrading everyone.
 * - Per organization on writes (any non-read method with a tenant):
 *   ORG_WRITE_RATE_LIMIT_PER_MIN. One very busy organization cannot starve the
 *   rest.
 *
 * Keys hold only a hash of the IP. Fails open: if the counter store is down the
 * request goes through (the auth throttler keeps guarding the login routes).
 */
@Injectable()
export class ScaleRateLimitGuard implements CanActivate {
  private readonly logger = new Logger('ScaleRateLimit');
  private readonly storage: ThrottlerStorage;
  private readonly publicLimit: number;
  private readonly orgWriteLimit: number;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) redis: Redis,
    private readonly tenant: TenantContextService,
  ) {
    this.storage =
      config.get('THROTTLER_STORAGE', { infer: true }) === 'redis'
        ? new RedisThrottlerStorage(redis)
        : new ThrottlerStorageService();
    this.publicLimit = config.get('PUBLIC_RATE_LIMIT_PER_MIN', { infer: true });
    this.orgWriteLimit = config.get('ORG_WRITE_RATE_LIMIT_PER_MIN', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if (READ_METHODS.has(req.method)) {
      if (!isPublicReadPath(req.path)) return true;
      const ipHash = createHash('sha256')
        .update(req.ip ?? '')
        .digest('hex')
        .slice(0, 32);
      return this.consume(`ip:${ipHash}`, this.publicLimit, 'scale-public', res);
    }

    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) return true;
    return this.consume(`org:${organizationId}`, this.orgWriteLimit, 'scale-org-write', res);
  }

  private async consume(key: string, limit: number, name: string, res: Response): Promise<boolean> {
    let record;
    try {
      record = await this.storage.increment(key, WINDOW_MS, limit, WINDOW_MS, name);
    } catch (error) {
      this.logger.warn(`counter store unavailable, letting the request through: ${(error as Error).message}`);
      return true;
    }
    if (record.isBlocked || record.totalHits > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(record.timeToBlockExpire || record.timeToExpire))));
      throw new HttpException('Demasiadas peticiones; intenta de nuevo en un momento.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
