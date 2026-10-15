import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { createStaffMember } from './support/platform-team';

/**
 * Ola 3 (R3-6): reservas del workspace de revisión. Solo roles de plataforma;
 * una reserva vigente es exclusiva (409 para otro revisor), se renueva por su
 * dueño, la libera su dueño (o un PlatformSuperAdmin) y queda auditada en la
 * organización reservada.
 *
 * F19: los revisores trabajan en EQUIPOS (la organización donde tienen sus roles
 * de plataforma). Otro equipo ve que el expediente está tomado, pero no por
 * quién, y su líder no puede liberar reservas ajenas a su equipo.
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
        ...LEGAL_ORG,
        organizationName: 'Org',
        displayName: 'Owner',
        email: `claims-${randomUUID()}@test.local`,
        password: 'password-claims-123',
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
  let otherTeamLead: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    target = await actorWithRoles(['owner']);
    reviewerA = await actorWithRoles(['owner', 'platform_admin']);
    // Same team as reviewerA.
    reviewerB = await createStaffMember(admin, app, {
      teamOrgId: reviewerA.orgId,
      roles: ['platform_admin'],
    });
    superAdmin = await createStaffMember(admin, app, {
      teamOrgId: reviewerA.orgId,
      roles: ['platform_super_admin'],
    });
    otherTeamLead = await createStaffMember(admin, app, { roles: ['platform_super_admin'] });
    createdOrgIds.push(otherTeamLead.orgId);
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

  it('another team sees the claim but not who holds it, and cannot override it', async () => {
    const list = await request(server)
      .get('/platform/review-claims')
      .set('Authorization', `Bearer ${otherTeamLead.token}`)
      .expect(200);
    const seen = list.body.find(
      (c: { organizationId: string }) => c.organizationId === target.orgId,
    );
    expect(seen.reviewerUserId).not.toBe(reviewerA.userId);
    expect(JSON.stringify(list.body)).not.toContain(reviewerA.userId);

    const conflict = await claim(otherTeamLead.token, target.orgId).expect(409);
    expect(JSON.stringify(conflict.body)).not.toContain(reviewerA.userId);

    await release(otherTeamLead.token, target.orgId).expect(403);
  });

  it('only the owner releases; a PlatformSuperAdmin of the team can override', async () => {
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
