import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { RedisUsageCache } from '../src/core/storage/usage-cache';

/** Plan de escala (B3): two replicas see the same quota total through Redis. */
describe('Shared storage usage cache (plan de escala, B3)', () => {
  const replicaA = new Redis(process.env.REDIS_URL!);
  const replicaB = new Redis(process.env.REDIS_URL!);

  afterAll(async () => {
    await replicaA.quit();
    await replicaB.quit();
  });

  it('an upload counted on one replica is seen by the other, with a TTL', async () => {
    const org = randomUUID();
    const a = new RedisUsageCache(replicaA);
    const b = new RedisUsageCache(replicaB);
    await a.set(org, 1_000);
    await b.add(org, 500);
    expect(await a.get(org)).toBe(1_500);
    const ttl = await replicaA.pttl(`${RedisUsageCache.KEY_PREFIX}${org}`);
    expect(ttl).toBeGreaterThan(0);
    await replicaA.del(`${RedisUsageCache.KEY_PREFIX}${org}`);
  });
});
