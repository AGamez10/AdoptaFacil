import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { applyHttpHardening } from '../src/core/http/configure-http';

/**
 * Plan de escala (B9): request ids, latency by route TEMPLATE, and a Prometheus
 * endpoint that only answers with the token.
 */
describe('Observability (plan de escala, B9)', () => {
  const token = 'token-de-prueba-metricas-0123456789';
  let app: INestApplication;

  beforeAll(async () => {
    process.env.METRICS_TOKEN = token;
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyHttpHardening(app, { production: false, trustProxyHops: 0 });
    await app.init();
  });

  afterAll(async () => {
    delete process.env.METRICS_TOKEN;
    await app?.close();
  });

  it('tags every response with a request id, keeping a well-formed one from the proxy', async () => {
    const fresh = await request(app.getHttpServer()).get('/health').expect(200);
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-Id', 'caddy-abc12345')
      .expect(200);
    expect(kept.headers['x-request-id']).toBe('caddy-abc12345');
  });

  it('hides /metrics without the token', async () => {
    await request(app.getHttpServer()).get('/metrics').expect(404);
    await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', 'Bearer otro')
      .expect(404);
  });

  it('records latency by route template, never by concrete slug', async () => {
    await request(app.getHttpServer()).get('/public/organizations/slug-secreto-xyz').expect(404);
    const res = await request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.text).toContain('http_request_duration_seconds_bucket');
    expect(res.text).toContain('route="/public/organizations/:slug"');
    expect(res.text).not.toContain('slug-secreto-xyz');
  });
});
