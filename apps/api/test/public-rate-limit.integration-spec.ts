import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PUBLIC_RATE_LIMITS } from '../src/core/bots/public-api-throttler.guard';

/**
 * Plan SEO (P0): every anonymous /public/* route shares ONE per-IP budget per
 * minute (PUBLIC_RATE_LIMIT_PER_MINUTE, lowered here to 10 so the test is
 * fast). Own app instance → own in-memory counters. Claiming to be Googlebot
 * in the User-Agent does not buy a bigger budget: only an IP verified by
 * reverse + forward DNS does (unit-tested in verified-bots.spec.ts).
 */
describe('Public API rate limiting', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PUBLIC_RATE_LIMITS)
      .useValue({ ip: 10, bot: 1200 })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('shares one budget across public routes and answers 429 with Retry-After past it', async () => {
    // Mixed routes and outcomes (200, 404, 400) all count against the same budget.
    const routes = [
      '/public/campaigns',
      '/public/organizations/no-such-org-x1',
      '/public/organizations/no-such-org-x1/animals',
      '/public/animals',
      '/public/organizations/no-such-org-x1/animals/not-a-ref',
    ];
    for (let i = 0; i < 10; i += 1) {
      const res = await request(server).get(routes[i % routes.length]);
      expect(res.status).not.toBe(429);
      expect(res.headers['x-ratelimit-limit']).toBe('10');
    }
    const blocked = await request(server).get('/public/campaigns').expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('a Googlebot User-Agent from an unverified IP stays under the normal limit', async () => {
    await request(server)
      .get('/public/campaigns')
      .set('User-Agent', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
      .expect(429);
  });

  it('does not touch non-public routes (their own limits still apply)', async () => {
    await request(server).get('/health').expect(200);
  });
});

describe('CSP violation reports (POST /public/security/csp-report)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('accepts both browser report formats and answers 204', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await request(server)
      .post('/public/security/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://site.example/donaciones/comprobante?token=abc',
            'effective-directive': 'script-src-elem',
            'blocked-uri': 'https://cdn.example/x.js',
          },
        }),
      )
      .expect(204);
    await request(server)
      .post('/public/security/csp-report')
      .set('Content-Type', 'application/reports+json')
      .send(JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'img-src' } }]))
      .expect(204);
    const logged = warn.mock.calls.map(([message]) => String(message));
    expect(logged.some((m) => m.includes('"page":"/donaciones/comprobante"'))).toBe(true);
    expect(logged.some((m) => m.includes('"directive":"img-src"'))).toBe(true);
    expect(logged.join('\n')).not.toContain('token=abc');
    warn.mockRestore();
  });

  it('drops oversized bodies unread and still answers 204', async () => {
    await request(server)
      .post('/public/security/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send('x'.repeat(20 * 1024))
      .expect(204);
  });
});
