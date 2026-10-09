import { randomInt, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { RedisThrottlerStorage } from '../src/core/auth/redis-throttler.storage';
import { applyHttpHardening } from '../src/core/http/configure-http';

/**
 * Ola 1 · R1-3 (SEC-009, SEC-010): security headers, `trust proxy` by hop
 * count, and auth rate limiting shared in Redis. The apps are hardened with
 * the same `applyHttpHardening` that main.ts runs, with
 * THROTTLER_STORAGE=redis as production requires.
 */
describe('HTTP hardening (R1-3)', () => {
  const apps: INestApplication[] = [];
  let previousStorage: string | undefined;
  let AppModule: unknown;

  async function createApp(trustProxyHops: number): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule as never],
    }).compile();
    const app = moduleRef.createNestApplication();
    applyHttpHardening(app, { production: true, trustProxyHops });
    await app.init();
    apps.push(app);
    return app;
  }

  /** A client address nobody else uses in this run (TEST-NET-3 + random). */
  function clientIp(): string {
    return `203.0.${randomInt(0, 255)}.${randomInt(1, 254)}`;
  }

  const login = (app: INestApplication, ip: string, email: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: 'wrong-password' });

  beforeAll(async () => {
    previousStorage = process.env.THROTTLER_STORAGE;
    process.env.THROTTLER_STORAGE = 'redis';
    // Start from empty rate-limit buckets (the loopback bucket of a previous
    // run would otherwise still be inside its window).
    const redis = new Redis(process.env.REDIS_URL as string);
    const keys = await redis.keys(`${RedisThrottlerStorage.KEY_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
    ({ AppModule } = await import('../src/app.module'));
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    if (previousStorage === undefined) delete process.env.THROTTLER_STORAGE;
    else process.env.THROTTLER_STORAGE = previousStorage;
  });

  it('sends security headers and hides X-Powered-By (SEC-009)', async () => {
    const app = await createApp(1);
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    // Images from /storage/public are loaded cross-origin by the web app.
    expect(response.headers['cross-origin-resource-policy']).toBeUndefined();
    // Error responses carry them too.
    const notFound = await request(app.getHttpServer()).get('/does-not-exist');
    expect(notFound.headers['x-content-type-options']).toBe('nosniff');
    expect(notFound.headers['x-powered-by']).toBeUndefined();
  });

  it('shares the login budget across instances through Redis, per real client IP (SEC-010)', async () => {
    const first = await createApp(1);
    const second = await createApp(1);
    const ip = clientIp();
    const email = `rl-${randomUUID()}@test.local`;
    // Budget: 5 per minute per client (auth.controller). 3 hits on one
    // instance + 2 on the other use it up...
    for (let i = 0; i < 3; i += 1) await login(first, ip, email).expect(401);
    for (let i = 0; i < 2; i += 1) await login(second, ip, email).expect(401);
    // ...so the 6th is refused by EITHER instance.
    await login(second, ip, email).expect(429);
    await login(first, ip, email).expect(429);
    // Another client behind the same proxy keeps its own budget.
    await login(first, clientIp(), email).expect(401);
  });

  it('ignores a forged X-Forwarded-For when no proxy is trusted', async () => {
    const app = await createApp(0);
    const email = `rl-${randomUUID()}@test.local`;
    // With 0 trusted hops req.ip is the socket address: rotating the header
    // on every request does not buy a fresh budget.
    for (let i = 0; i < 5; i += 1) await login(app, clientIp(), email).expect(401);
    await login(app, clientIp(), email).expect(429);
  });
});
