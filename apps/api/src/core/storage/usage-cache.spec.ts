import { Redis } from 'ioredis';
import { MemoryUsageCache, RedisUsageCache, type UsageCache } from './usage-cache';

const ORG = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';

function behavesLikeAUsageCache(name: string, make: () => UsageCache) {
  describe(name, () => {
    it('only adds to a total that was measured before', async () => {
      const cache = make();
      await cache.add(ORG, 10);
      expect(await cache.get(ORG)).toBeNull();
      await cache.set(ORG, 100);
      await cache.add(ORG, 25);
      expect(await cache.get(ORG)).toBe(125);
    });
  });
}

describe('storage usage cache (plan de escala, B3)', () => {
  behavesLikeAUsageCache('memory', () => new MemoryUsageCache());

  it('redis fails open when Redis does not answer', async () => {
    const down = new Redis({
      port: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    });
    down.on('error', () => undefined);
    const cache = new RedisUsageCache(down);
    expect(await cache.get(ORG)).toBeNull();
    await expect(cache.set(ORG, 1)).resolves.toBeUndefined();
    await expect(cache.add(ORG, 1)).resolves.toBeUndefined();
    down.disconnect();
  });
});
