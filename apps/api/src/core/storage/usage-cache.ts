import type { Redis } from 'ioredis';

/** How long a measured org total is reused before measuring again. */
export const USAGE_CACHE_MS = 5 * 60 * 1000;

/**
 * Cached bytes per organization for the plan storage quota. Plan de escala
 * (B3): with several API replicas the total must be the same everywhere, so
 * production keeps it in Redis; tests and single-process dev use memory.
 */
export interface UsageCache {
  get(organizationId: string): Promise<number | null>;
  set(organizationId: string, bytes: number): Promise<void>;
  /** Add freshly written bytes to a cached total (no-op when none is cached). */
  add(organizationId: string, bytes: number): Promise<void>;
}

export class MemoryUsageCache implements UsageCache {
  private readonly entries = new Map<string, { bytes: number; at: number }>();

  async get(organizationId: string): Promise<number | null> {
    const entry = this.entries.get(organizationId);
    return entry && Date.now() - entry.at < USAGE_CACHE_MS ? entry.bytes : null;
  }

  async set(organizationId: string, bytes: number): Promise<void> {
    this.entries.set(organizationId, { bytes, at: Date.now() });
  }

  async add(organizationId: string, bytes: number): Promise<void> {
    const entry = this.entries.get(organizationId);
    if (entry) entry.bytes += bytes;
  }
}

/** Atomic "add only if the key exists", keeping its TTL. */
const ADD_IF_PRESENT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return redis.call('INCRBY', KEYS[1], ARGV[1])
end
return nil`;

export class RedisUsageCache implements UsageCache {
  static readonly KEY_PREFIX = 'storage-usage:';

  constructor(private readonly redis: Redis) {}

  private key(organizationId: string): string {
    return `${RedisUsageCache.KEY_PREFIX}${organizationId}`;
  }

  // Fails open: if Redis does not answer, the total is simply measured again.
  async get(organizationId: string): Promise<number | null> {
    const value = await this.redis.get(this.key(organizationId)).catch(() => null);
    return value === null ? null : Number(value);
  }

  async set(organizationId: string, bytes: number): Promise<void> {
    await this.redis
      .set(this.key(organizationId), String(bytes), 'PX', USAGE_CACHE_MS)
      .catch(() => undefined);
  }

  async add(organizationId: string, bytes: number): Promise<void> {
    await this.redis
      .eval(ADD_IF_PRESENT, 1, this.key(organizationId), String(bytes))
      .catch(() => undefined);
  }
}
