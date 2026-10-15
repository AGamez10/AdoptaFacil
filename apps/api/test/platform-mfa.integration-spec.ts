import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { totpAt } from '../src/core/auth/mfa/totp';
import { REDIS_CLIENT } from '../src/redis/redis.service';
import { purgeOrganizations } from './support/cleanup';
import { createStaffMember, STAFF_PASSWORD, type StaffMember } from './support/platform-team';
import { LEGAL_ORG } from './support/legal';

/**
 * F19 security · second factor (TOTP) for platform staff, enforced as in
 * production: no platform tool answers without it, enrollment needs the
 * password again, codes are single-use, the account locks after 5 wrong codes,
 * and the secret is stored encrypted.
 */
describe('Platform staff MFA (F19)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let redis: Redis;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const previousMfa = process.env.PLATFORM_MFA_REQUIRED;
  const realNow = Date.now.bind(Date);
  let offsetMs = 0;

  beforeAll(async () => {
    process.env.PLATFORM_MFA_REQUIRED = 'true';
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offsetMs);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (previousMfa === undefined) delete process.env.PLATFORM_MFA_REQUIRED;
    else process.env.PLATFORM_MFA_REQUIRED = previousMfa;
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('a new staff account must set up the second factor before any platform tool', async () => {
    const member = await createStaffMember(admin, app, { roles: ['platform_admin'] });
    createdOrgIds.push(member.orgId);

    const blocked = await request(server)
      .get('/platform/workspace/me')
      .set(bearer(member.token))
      .expect(403);
    expect(blocked.body.code).toBe('MFA_ENROLLMENT_REQUIRED');
    // Same for the existing platform catalog.
    const catalog = await request(server)
      .get('/platform/review-claims')
      .set(bearer(member.token))
      .expect(403);
    expect(catalog.body.code).toBe('MFA_ENROLLMENT_REQUIRED');

    await request(server)
      .post('/auth/mfa/enroll')
      .set(bearer(member.token))
      .send({ password: 'wrong-password-123' })
      .expect(401);
    const enrollment = await request(server)
      .post('/auth/mfa/enroll')
      .set(bearer(member.token))
      .send({ password: STAFF_PASSWORD })
      .expect(200);
    expect(enrollment.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(enrollment.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    // Stored encrypted: the secret never appears in the database row.
    const factor = await admin.authMfaFactor.findUniqueOrThrow({
      where: { userId: member.userId },
    });
    expect(factor.secretCiphertext).not.toContain(enrollment.body.secret);
    expect(factor.confirmedAt).toBeNull();

    const verified = await request(server)
      .post('/auth/mfa/enroll/confirm')
      .set(bearer(member.token))
      .send({ code: totpAt(enrollment.body.secret, Date.now()) })
      .expect(200);
    await request(server)
      .get('/platform/workspace/me')
      .set(bearer(verified.body.accessToken))
      .expect(200);

    // A confirmed factor cannot be replaced from a session (needs four eyes).
    await request(server)
      .post('/auth/mfa/enroll')
      .set(bearer(verified.body.accessToken))
      .send({ password: STAFF_PASSWORD })
      .expect(409);

    const actions = await admin.auditLog.findMany({
      where: {
        organizationId: member.orgId,
        actorUserId: member.userId,
        action: { startsWith: 'auth.mfa.' },
      },
      select: { action: true, metadata: true },
    });
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'auth.mfa.enrollment_password_failed',
        'auth.mfa.enrollment_started',
        'auth.mfa.enrolled',
      ]),
    );
    expect(JSON.stringify(actions)).not.toContain(enrollment.body.secret);
  });

  it('an enrolled account passes the code once per session; codes are single-use', async () => {
    const member: StaffMember = await createStaffMember(admin, app, {
      roles: ['platform_super_admin'],
      enrolled: true,
    });
    createdOrgIds.push(member.orgId);

    const blocked = await request(server)
      .get('/platform/workspace/me')
      .set(bearer(member.token))
      .expect(403);
    expect(blocked.body.code).toBe('MFA_REQUIRED');

    await request(server)
      .post('/auth/mfa/verify')
      .set(bearer(member.token))
      .send({ code: '12345' })
      .expect(400);

    const code = totpAt(member.totpSecret!, Date.now());
    const session = await request(server)
      .post('/auth/mfa/verify')
      .set(bearer(member.token))
      .send({ code })
      .expect(200);
    await request(server)
      .get('/platform/workspace/me')
      .set(bearer(session.body.accessToken))
      .expect(200);

    // Replaying the same code is refused.
    const replay = await request(server)
      .post('/auth/mfa/verify')
      .set(bearer(session.body.accessToken))
      .send({ code })
      .expect(401);
    expect(replay.body.code).toBe('MFA_INVALID_CODE');

    // The refresh keeps the second factor within the work day…
    const refreshed = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: session.body.refreshToken })
      .expect(200);
    await request(server)
      .get('/platform/workspace/me')
      .set(bearer(refreshed.body.accessToken))
      .expect(200);

    // …but not after it: 9 hours later the platform asks for the code again.
    offsetMs += 9 * 60 * 60 * 1000;
    const late = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(200);
    const after = await request(server)
      .get('/platform/workspace/me')
      .set(bearer(late.body.accessToken))
      .expect(403);
    expect(after.body.code).toBe('MFA_REQUIRED');
  });

  it('wrong codes count towards a temporary lock that even the right code cannot pass', async () => {
    const member = await createStaffMember(admin, app, {
      roles: ['platform_admin'],
      enrolled: true,
    });
    createdOrgIds.push(member.orgId);

    // One wrong code here keeps the suite under the per-IP throttle of /verify.
    for (let i = 0; i < 1; i += 1) {
      const wrong = await request(server)
        .post('/auth/mfa/verify')
        .set(bearer(member.token))
        .send({ code: '000000' });
      expect([401]).toContain(wrong.status);
    }
    expect(Number(await redis.get(`mfa:failures:${member.userId}`))).toBe(1);

    // Reach the threshold (the per-IP throttle would also stop a brute force).
    await redis.set(`mfa:failures:${member.userId}`, '5', 'EX', 900);
    const locked = await request(server)
      .post('/auth/mfa/verify')
      .set(bearer(member.token))
      .send({ code: totpAt(member.totpSecret!, Date.now()) })
      .expect(429);
    expect(locked.body.code).toBe('MFA_LOCKED');

    const failures = await admin.auditLog.count({
      where: {
        organizationId: member.orgId,
        actorUserId: member.userId,
        action: 'auth.mfa.failed',
      },
    });
    expect(failures).toBe(1);
    await redis.del(`mfa:failures:${member.userId}`);
  });

  it('accounts without platform roles never see the second factor', async () => {
    const owner = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Fundación sin MFA',
        displayName: 'Owner',
        email: `mfa-owner-${Date.now()}@test.local`,
        password: 'password-owner-123',
      })
      .expect(201);
    createdOrgIds.push(owner.body.user.organizationId);
    const status = await request(server)
      .get('/auth/mfa/status')
      .set(bearer(owner.body.tokens.accessToken))
      .expect(200);
    expect(status.body).toMatchObject({ required: false, enrolled: false });
    await request(server)
      .post('/auth/mfa/enroll')
      .set(bearer(owner.body.tokens.accessToken))
      .send({ password: 'password-owner-123' })
      .expect(403);
  });
});
