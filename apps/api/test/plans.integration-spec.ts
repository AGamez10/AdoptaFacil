import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PlansService } from '../src/core/plans/plans.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';

/**
 * Planes y suscripciones: `GET /org/plan` (Owner/Administrator) and the
 * platform endpoints that activate a plan after a manual payment. Enforcement
 * is switched on per test through the service instance (the env flag is read
 * once at boot and is OFF by default).
 */
describe('Plans and subscriptions', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Planes',
        displayName: 'Owner',
        email: `plans-${randomUUID()}@test.local`,
        password: 'password-plans-123',
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  const setEnforced = (value: boolean) =>
    Object.defineProperty(plans, 'enforced', { value, configurable: true });

  const getPlan = (token: string) =>
    request(server).get('/org/plan').set('Authorization', `Bearer ${token}`);

  const assign = (token: string, orgId: string, body: Record<string, unknown>) =>
    request(server)
      .put(`/platform/organizations/${orgId}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

  let platformAdmin: Actor;
  let owner: Actor;
  let other: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);

    platformAdmin = await registerOrg();
    await admin.userRole.create({
      data: {
        organizationId: platformAdmin.orgId,
        userId: platformAdmin.userId,
        role: 'platform_admin',
      },
    });
    owner = await registerOrg();
    other = await registerOrg();
  });

  afterEach(() => setEnforced(false));

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('with enforcement off (default) every organization gets pro and the full catalog', async () => {
    const res = await getPlan(owner.token).expect(200);
    expect(res.body.enforced).toBe(false);
    expect(res.body.effectivePlan).toBe('pro');
    expect(res.body.subscription).toBeNull();
    expect(res.body.usage.members).toBeGreaterThanOrEqual(1);
    expect(res.body.catalog.map((p: { key: string }) => p.key)).toEqual(['free', 'crece', 'pro']);
  });

  it('with enforcement on, an organization without subscription is on free', async () => {
    setEnforced(true);
    const res = await getPlan(owner.token).expect(200);
    expect(res.body.effectivePlan).toBe('free');
    expect(res.body.limits.portalDesigns).toBe(1);
    expect(res.body.capabilities.customDomain).toBe(false);
  });

  it('an org role cannot assign plans (403) — not even to its own organization', async () => {
    await assign(owner.token, owner.orgId, {
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: inDays(30),
    }).expect(403);
  });

  it('the platform activates a plan; the org sees it and the change is audited in its log', async () => {
    setEnforced(true);
    const res = await assign(platformAdmin.token, owner.orgId, {
      plan: 'crece',
      status: 'active',
      currentPeriodEnd: inDays(30),
      providerReference: 'FE-0001',
      discountPercent: 50,
    }).expect(200);
    expect(res.body).toMatchObject({
      organizationId: owner.orgId,
      plan: 'crece',
      status: 'active',
    });

    const view = await getPlan(owner.token).expect(200);
    expect(view.body.effectivePlan).toBe('crece');
    expect(view.body.subscription.discountPercent).toBe(50);
    expect(view.body.graceEndsAt).not.toBeNull();

    const audit = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'organization.plan_changed' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorUserId).toBe(platformAdmin.userId);
  });

  it('a paid plan lapses to free after the period plus 15 grace days', async () => {
    setEnforced(true);
    await assign(platformAdmin.token, owner.orgId, {
      plan: 'crece',
      status: 'past_due',
      currentPeriodEnd: inDays(-16),
    }).expect(200);
    expect((await getPlan(owner.token).expect(200)).body.effectivePlan).toBe('free');

    await assign(platformAdmin.token, owner.orgId, {
      plan: 'crece',
      status: 'past_due',
      currentPeriodEnd: inDays(-10),
    }).expect(200);
    expect((await getPlan(owner.token).expect(200)).body.effectivePlan).toBe('crece');
  });

  it('assigning to one organization never touches another', async () => {
    setEnforced(true);
    const view = await getPlan(other.token).expect(200);
    expect(view.body.subscription).toBeNull();
    expect(view.body.effectivePlan).toBe('free');
  });

  it('rejects a paid status without period end (400) and an unknown org (404)', async () => {
    await assign(platformAdmin.token, owner.orgId, { plan: 'pro', status: 'active' }).expect(400);
    await assign(platformAdmin.token, randomUUID(), {
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: inDays(30),
    }).expect(404);
  });

  it('assertWithinLimit refuses going over the plan limit with PLAN_REQUIRED', async () => {
    setEnforced(true);
    await expect(plans.assertWithinLimit(other.orgId, 'members', 3)).resolves.toBeUndefined();
    await expect(plans.assertWithinLimit(other.orgId, 'members', 4)).rejects.toMatchObject({
      response: { code: 'PLAN_REQUIRED', limit: 'members', requiredPlan: 'crece' },
    });
  });
});
