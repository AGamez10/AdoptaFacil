import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PlansService } from '../src/core/plans/plans.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * Portal sin el sello "Hecho con AdoptaFácil" (`portalRemoveSeal`, Crece y Pro).
 * La organización guarda su elección; el portal público la aplica solo mientras
 * su plan incluya la capacidad. Al terminar el plan el sello vuelve sin perder
 * la elección, igual que las plantillas de pago.
 */
describe('Portal seal removal (portalRemoveSeal)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  interface Actor {
    token: string;
    orgId: string;
  }

  async function registerOrg(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Refugio Sin Sello',
        displayName: 'Owner',
        email: `seal-${randomUUID()}@test.local`,
        password: 'password-seal-123',
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  const setEnforced = (value: boolean) =>
    Object.defineProperty(plans, 'enforced', { value, configurable: true });
  const setPromoEnd = (value: Date | null) =>
    Object.defineProperty(plans, 'promoEndsAt', { value, configurable: true });
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const subscribe = (orgId: string, plan: string, end: Date) =>
    admin.organizationSubscription.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, plan, status: 'active', currentPeriodEnd: end },
      update: { plan, status: 'active', currentPeriodEnd: end },
    });
  /** Planes encendidos y sin promoción de lanzamiento: sin suscripción es Gratis. */
  const freePlan = () => {
    setEnforced(true);
    setPromoEnd(inDays(-1));
  };

  let owner: Actor;
  const slug = `sello-${randomUUID().slice(0, 8)}`;
  const publicTheme = () => request(server).get(`/public/organizations/${slug}/theme`).expect(200);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);

    owner = await registerOrg();
    await approveTestOrganization(admin, owner.orgId);
    await request(server).put('/org/profile').set(auth(owner.token)).send({ slug }).expect(200);
  });

  afterEach(async () => {
    setEnforced(false);
    setPromoEnd(null);
    await admin.organizationSubscription.deleteMany({ where: { organizationId: owner.orgId } });
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('shows the seal by default, publicly and in the own read', async () => {
    await request(server).put('/portals/theme').set(auth(owner.token)).send({ tokens: {} });
    const own = await request(server).get('/portals/theme').set(auth(owner.token)).expect(200);
    expect(own.body.hideSeal).toBe(false);
    expect(own.body.removeSealAvailable).toBe(true);
    expect((await publicTheme()).body.hideSeal).toBe(false);
  });

  it('with plans off (pilot) the org hides the seal and the change is audited', async () => {
    const res = await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: {}, hideSeal: true })
      .expect(200);
    expect(res.body.hideSeal).toBe(true);
    expect((await publicTheme()).body.hideSeal).toBe(true);

    const events = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'portal.theme_updated' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect((events[0].metadata as { layout: string[] }).layout).toContain('hideSeal');
  });

  it('saving colors without hideSeal keeps the stored choice', async () => {
    await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: { primary: '142 72% 29%' } })
      .expect(200);
    const row = await admin.portalTheme.findUnique({ where: { organizationId: owner.orgId } });
    expect(row?.hideSeal).toBe(true);
  });

  it('on the free plan the seal comes back publicly, but the choice is kept', async () => {
    freePlan();
    expect((await publicTheme()).body.hideSeal).toBe(false);
    const own = await request(server).get('/portals/theme').set(auth(owner.token)).expect(200);
    expect(own.body.hideSeal).toBe(true);
    expect(own.body.removeSealAvailable).toBe(false);
  });

  it('on the free plan asking to hide the seal answers 403 PLAN_REQUIRED; showing it is allowed', async () => {
    freePlan();
    const res = await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: {}, hideSeal: true })
      .expect(403);
    expect(res.body).toMatchObject({
      code: 'PLAN_REQUIRED',
      capability: 'portalRemoveSeal',
      requiredPlan: 'crece',
    });
    await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: {}, hideSeal: false })
      .expect(200);
    const row = await admin.portalTheme.findUnique({ where: { organizationId: owner.orgId } });
    expect(row?.hideSeal).toBe(false);
  });

  it('paying Crece lets the org hide it again; when the payment lapses it shows again', async () => {
    freePlan();
    await subscribe(owner.orgId, 'crece', inDays(30));
    await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: {}, hideSeal: true })
      .expect(200);
    expect((await publicTheme()).body.hideSeal).toBe(true);

    // Vence el pago y pasan los 15 días de gracia.
    await subscribe(owner.orgId, 'crece', inDays(-16));
    expect((await publicTheme()).body.hideSeal).toBe(false);
  });

  it('rejects a non-boolean hideSeal', async () => {
    await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: {}, hideSeal: 'yes' })
      .expect(400);
  });

  it('an unknown slug never hides the seal', async () => {
    const res = await request(server)
      .get(`/public/organizations/no-existe-${randomUUID().slice(0, 6)}/theme`)
      .expect(200);
    expect(res.body.hideSeal).toBe(false);
  });
});
