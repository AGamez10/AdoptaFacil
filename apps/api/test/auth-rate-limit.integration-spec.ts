import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Rate limiting on the auth endpoints. Uses its own app instance so the
 * throttler's in-memory counter is isolated from the other suites. The login
 * endpoint is limited to 5 requests / minute per IP; the 6th must be rejected
 * with HTTP 429 regardless of the (wrong) credentials.
 */
describe('Auth rate limiting', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const email = `ratelimit-${randomUUID()}@test.local`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('blocks with 429 once the per-IP login budget is exceeded', async () => {
    // First 5 attempts are allowed through to the handler (401 wrong creds).
    for (let i = 0; i < 5; i += 1) {
      await request(server)
        .post('/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    }
    // The 6th within the window is throttled before reaching the handler.
    await request(server)
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(429);
  });

  it('keeps the person registration budget at 10 per minute', async () => {
    // Invalid payloads (400) still count against the budget; the 11th is 429.
    for (let i = 0; i < 10; i += 1) {
      await request(server)
        .post('/auth/register/person')
        .send({ displayName: 'X', email: 'not-an-email', password: 'short' })
        .expect(400);
    }
    await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'X', email: 'not-an-email', password: 'short' })
      .expect(429);
  });

  it('lets page loads keep the session alive well past the 20/min default', async () => {
    // Every full page load calls refresh/silent and me (twice each in dev), and
    // a platform admin's page also reads mfa/status.
    // 30 in a row must all reach their handlers: refresh/silent answers
    // `null` without a cookie, and me answers 401 without a token.
    for (let i = 0; i < 30; i += 1) {
      await request(server).post('/auth/refresh/silent').expect(200);
      await request(server).get('/auth/me').expect(401);
      await request(server).get('/auth/mfa/status').expect(401);
    }
  });

  it('does not let session traffic loosen the login budget', async () => {
    // The login budget was exhausted by the first test; the session routes'
    // own budget never resets or widens it.
    await request(server)
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(429);
  });
});
