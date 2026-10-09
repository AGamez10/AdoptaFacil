import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

/** Shape @nestjs/throttler v6 expects back from `increment` (times in seconds). */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Atomic fixed-window counter + block marker. KEYS[1] = hits, KEYS[2] = block;
 * ARGV = ttl ms, limit, block duration ms. Returns
 * {hits, hits pttl ms, blocked (0|1), block pttl ms}.
 */
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  local hitsTtl = redis.call('PTTL', KEYS[1])
  if hitsTtl < 0 then hitsTtl = 0 end
  return {hits, hitsTtl, 1, blockTtl}
end
local hits = redis.call('INCR', KEYS[1])
local hitsTtl = redis.call('PTTL', KEYS[1])
if hitsTtl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  hitsTtl = tonumber(ARGV[1])
end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, hitsTtl, 1, tonumber(ARGV[3])}
end
return {hits, hitsTtl, 0, 0}
`;

/**
 * Rate-limit counters in Redis (Ola 1, R1-3, SEC-010). The in-memory default
 * was per process: every restart or extra instance reset the budget of the
 * auth endpoints. Here the counters live in the shared Redis, so the limit
 * holds across instances and restarts. Keys carry only the throttler's own
 * hashed key — never an email, token or raw IP.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  static readonly KEY_PREFIX = 'throttler:';

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `${RedisThrottlerStorage.KEY_PREFIX}${throttlerName}:${key}`;
    const [hits, hitsTtl, blocked, blockTtl] = (await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      `${base}:hits`,
      `${base}:block`,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number, number];
    return {
      totalHits: hits,
      timeToExpire: Math.ceil(hitsTtl / 1000),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.ceil(blockTtl / 1000),
    };
  }
}
