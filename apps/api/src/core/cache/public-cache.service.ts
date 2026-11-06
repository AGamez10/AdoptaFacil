import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.validation';

/**
 * Plan de escala (B5): cache-aside for ANONYMOUS public reads, in a Redis of
 * its own (REDIS_CACHE_URL, `allkeys-lru`) — never in the queue Redis, which
 * must not evict (B10).
 *
 * Freshness is by TTL only (PUBLIC_CACHE_TTL_S, 30 s by default): a change made
 * by an organization shows publicly within that window. Fails open: with no
 * REDIS_CACHE_URL, or when the cache is slow or down, every call simply runs
 * the handler, so the cache can never take the site down.
 */
@Injectable()
export class PublicCacheService implements OnModuleDestroy {
  private readonly logger = new Logger('PublicCache');
  private readonly client: Redis | null;
  readonly ttlSeconds: number;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('REDIS_CACHE_URL', { infer: true });
    this.ttlSeconds = config.get('PUBLIC_CACHE_TTL_S', { infer: true });
    this.client = url
      ? new Redis(url, {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          commandTimeout: 150,
        })
      : null;
    this.client?.on('error', (error) => this.logger.warn(`cache: ${error.message}`));
    this.client?.connect().catch(() => undefined);
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, value, 'EX', this.ttlSeconds);
    } catch {
      // Fail open: a missed write only means the next visit asks Postgres.
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
