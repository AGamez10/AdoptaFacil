import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Plan de escala (B5): anonymous public reads are served from the cache Redis
 * after the first hit, carry CDN headers, and errors are never cached.
 */
describe('Public read cache (plan de escala, B5)', () => {
  const cacheUrl = `${process.env.REDIS_URL!.replace(/\/\d*$/, '')}/5`;
  let app: INestApplication;
  let cache: Redis;

  beforeAll(async () => {
    process.env.REDIS_CACHE_URL = cacheUrl;
    cache = new Redis(cacheUrl);
    await cache.flushdb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    delete process.env.REDIS_CACHE_URL;
    await app?.close();
    await cache.flushdb();
    await cache.quit();
  });

  it('answers the second visit from the cache, with CDN headers', async () => {
    const first = await request(app.getHttpServer()).get('/public/campaigns?limit=5').expect(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=30, stale-while-revalidate=300',
    );

    // Give the fire-and-forget write a moment to land.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await request(app.getHttpServer()).get('/public/campaigns?limit=5').expect(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);
    expect(await cache.ttl((await cache.keys('pc:v1:*'))[0])).toBeLessThanOrEqual(30);
  });

  it('never caches an error answer', async () => {
    await cache.flushdb();
    await request(app.getHttpServer()).get('/public/organizations/no-existe-xyz').expect(404);
    expect(await cache.keys('pc:v1:*')).toHaveLength(0);
  });

  it('leaves authenticated endpoints untouched', async () => {
    const res = await request(app.getHttpServer()).get('/portals/theme');
    expect(res.headers['x-cache']).toBeUndefined();
  });
});
