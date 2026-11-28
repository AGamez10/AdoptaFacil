import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  NOTIFICATION_PORT,
  type NotificationMessage,
  type NotificationPort,
} from '../src/core/notifications/notification.port';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_PERSON } from './support/legal';

/**
 * Full password-recovery flow (T-110 / RF05): request → emailed link → set new
 * password → login with it, plus the security cases (expired / reused / invalid
 * token, weak password, session revocation).
 *
 * Own app instance so the per-IP throttler budget (5/min on the reset endpoints)
 * is isolated from the other auth suites. The reset endpoints are exercised at
 * most 5 times each here, staying within that budget.
 */
class CapturingNotificationPort implements NotificationPort {
  readonly sent: NotificationMessage[] = [];
  async send(message: NotificationMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** The raw token lives ONLY in the emailed link (the DB stores just its hash). */
function tokenFromLink(body: string): string {
  const match = body.match(/reset-password\?token=([^\s]+)/);
  if (!match) throw new Error('no reset link found in email body');
  return decodeURIComponent(match[1]);
}

describe('Password recovery (request → link → confirm)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const notifications = new CapturingNotificationPort();

  const email = `t110-${randomUUID()}@test.local`;
  const oldPassword = 'oldpassword123';
  const newPassword = 'newpassword456';
  let orgId: string;
  let userId: string;
  let staleRefreshToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Capture reset emails instead of sending them (the log driver would swallow
      // the token, and we must read it to drive the confirm step).
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notifications)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const reg = await request(server)
      .post('/auth/register/person')
      .send({ ...LEGAL_PERSON, displayName: 'Reset User', email, password: oldPassword })
      .expect(201);
    orgId = reg.body.user.organizationId;
    userId = reg.body.user.id;
    // A live session whose refresh token must be revoked by the reset.
    staleRefreshToken = reg.body.tokens.refreshToken;
  });

  afterAll(async () => {
    // The reset flow writes append-only audit_logs rows, whose immutability
    // trigger blocks the org cascade DELETE (RNF04). purgeOrganizations clears
    // those rows under replica mode first (same teardown as the other suites
    // that audit), so the org removal — and app.close() — go through cleanly.
    await purgeOrganizations(admin, [orgId]);
    await admin.$disconnect();
    await app?.close();
  });

  it('completes recovery and logs in with the NEW password (old one stops working)', async () => {
    notifications.sent.length = 0;
    await request(server).post('/auth/password-reset').send({ email }).expect(202);
    const token = tokenFromLink(notifications.sent.at(-1)!.body);

    await request(server)
      .post('/auth/password-reset/confirm')
      .send({ token, password: newPassword })
      .expect(204);

    await request(server).post('/auth/login').send({ email, password: oldPassword }).expect(401);
    await request(server).post('/auth/login').send({ email, password: newPassword }).expect(200);

    // Session revocation: the refresh token minted BEFORE the reset is dead.
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: staleRefreshToken })
      .expect(401);

    // Single-use: the SAME token cannot be replayed.
    await request(server)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'replayattempt789' })
      .expect(400);
  });

  it('rejects an invalid token generically', async () => {
    await request(server)
      .post('/auth/password-reset/confirm')
      .send({ token: 'not-a-real-token', password: 'whatevergoes123' })
      .expect(400);
  });

  it('rejects an expired token', async () => {
    // Insert an already-expired token directly (superuser bypasses RLS).
    const raw = `${randomUUID()}${randomUUID()}`;
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    await admin.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt: new Date(Date.now() - 1_000) },
    });
    await request(server)
      .post('/auth/password-reset/confirm')
      .send({ token: raw, password: 'freshpass1234' })
      .expect(400);
  });

  it('rejects a weak new password (registration policy enforced)', async () => {
    // Weak password is rejected by validation regardless of the token.
    await request(server)
      .post('/auth/password-reset/confirm')
      .send({ token: 'any-token', password: 'short' })
      .expect(400);
  });
});

/**
 * Audit run-4 F6 + RA-01: completing one reset consumes EVERY other pending link
 * of the account, and access tokens issued before the reset stop working at
 * once (not 15 minutes later). Own app instance: own throttler budget.
 */
describe('Password recovery: sibling links and live access tokens (audit run-4 F6, RA-01)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const notifications = new CapturingNotificationPort();
  const email = `t110-f6-${randomUUID()}@test.local`;
  let orgId: string;
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(notifications)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    const reg = await request(server)
      .post('/auth/register/person')
      .send({ ...LEGAL_PERSON, displayName: 'F6 User', email, password: 'oldpassword123' })
      .expect(201);
    orgId = reg.body.user.organizationId;
    accessToken = reg.body.tokens.accessToken;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, [orgId]);
    await admin.$disconnect();
    await app?.close();
  });

  it('kills sibling reset links and pre-reset access tokens', async () => {
    await request(server).get('/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);

    notifications.sent.length = 0;
    await request(server).post('/auth/password-reset').send({ email }).expect(202);
    await request(server).post('/auth/password-reset').send({ email }).expect(202);
    const [first, second] = notifications.sent.map((m) => tokenFromLink(m.body));
    expect(first).not.toBe(second);

    // `iat` has one-second resolution: make the old token clearly older.
    await new Promise((r) => setTimeout(r, 1100));
    await request(server)
      .post('/auth/password-reset/confirm')
      .send({ token: second, password: 'ownerpassword123' })
      .expect(204);

    // RA-01: the access token minted before the reset is dead right away.
    const dead = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    expect(dead.body.code).toBe('SESSION_REVOKED');

    // F6: the older sibling link can no longer overwrite the owner's password.
    await request(server)
      .post('/auth/password-reset/confirm')
      .send({ token: first, password: 'attackerpassword123' })
      .expect(400);

    const login = await request(server)
      .post('/auth/login')
      .send({ email, password: 'ownerpassword123' })
      .expect(200);
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.tokens.accessToken}`)
      .expect(200);
  });
});
