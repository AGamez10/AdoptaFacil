import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * Ola 3 (R3-6): reservas del workspace de revisión. Solo roles de plataforma;
 * una reserva vigente es exclusiva (409 para otro revisor), se renueva por su
 * dueño, la libera su dueño (o un PlatformSuperAdmin) y queda auditada en la
 * organización reservada.
 */
describe('Platform review claims (R3-6)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function actorWithRoles(roles: string[]): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Org',
        displayName: 'Owner',
        email: `claims-${randomUUID()}@test.local`,
        password: 'password123',
      })
      .expect(201);
    const actor = {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
    createdOrgIds.push(actor.orgId);
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  const claim = (token: string, orgId: string) =>
    request(server).put(`/platform/review-claims/${orgId}`).set('Authorization', `Bearer ${token}`);
  const release = (token: string, orgId: string) =>
    request(server)
      .delete(`/platform/review-claims/${orgId}`)
      .set('Authorization', `Bearer ${token}`);

  let target: Actor;
  let reviewerA: Actor;
  let reviewerB: Actor;
  let superAdmin: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    target = await actorWithRoles(['owner']);
    reviewerA = await actorWithRoles(['owner', 'platform_admin']);
    reviewerB = await actorWithRoles(['owner', 'platform_admin']);
    superAdmin = await actorWithRoles(['owner', 'platform_super_admin']);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('deny-by-default: org roles cannot list, take or release claims', async () => {
    await request(server)
      .get('/platform/review-claims')
      .set('Authorization', `Bearer ${target.token}`)
      .expect(403);
    await claim(target.token, target.orgId).expect(403);
    await release(target.token, target.orgId).expect(403);
  });

  it('a claim is exclusive, renewable by its owner and audited', async () => {
    const first = await claim(reviewerA.token, target.orgId).expect(200);
    expect(first.body).toMatchObject({
      organizationId: target.orgId,
      reviewerUserId: reviewerA.userId,
    });
    expect(new Date(first.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const conflict = await claim(reviewerB.token, target.orgId).expect(409);
    expect(conflict.body.claim.reviewerUserId).toBe(reviewerA.userId);

    const renewed = await claim(reviewerA.token, target.orgId).expect(200);
    expect(renewed.body.claimedAt).toBe(first.body.claimedAt);

    const list = await request(server)
      .get('/platform/review-claims')
      .set('Authorization', `Bearer ${reviewerB.token}`)
      .expect(200);
    expect(list.body.map((c: { organizationId: string }) => c.organizationId)).toContain(
      target.orgId,
    );

    const taken = await admin.auditLog.count({
      where: { organizationId: target.orgId, action: 'platform.review_claim.taken' },
    });
    expect(taken).toBe(1);
  });

  it('only the owner releases; a PlatformSuperAdmin can override', async () => {
    await release(reviewerB.token, target.orgId).expect(403);
    await release(superAdmin.token, target.orgId).expect(204);
    await release(reviewerA.token, target.orgId).expect(404);

    await claim(reviewerB.token, target.orgId).expect(200);
    await release(reviewerB.token, target.orgId).expect(204);

    const actions = await admin.auditLog.findMany({
      where: { organizationId: target.orgId, action: { startsWith: 'platform.review_claim' } },
      select: { action: true },
    });
    expect(actions.map((a: { action: string }) => a.action).sort()).toEqual([
      'platform.review_claim.overridden',
      'platform.review_claim.released',
      'platform.review_claim.taken',
      'platform.review_claim.taken',
    ]);
  });

  it('rejects malformed organization ids', async () => {
    await claim(reviewerA.token, 'not-a-uuid').expect(400);
  });
});
