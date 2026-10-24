import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PlansService } from '../src/core/plans/plans.service';
import { STORAGE_PORT, type StoragePort } from '../src/core/storage/storage.port';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * Planes encendidos (`PLAN_ENFORCEMENT`) sobre lo que hoy funciona:
 * - promoción de lanzamiento: sin suscripción, Pro gratis hasta
 *   `PLAN_LAUNCH_DATE` + 3 meses;
 * - plantillas de pago: al terminar el plan el portal vuelve solo a una
 *   gratuita, la elección se conserva y regresa al pagar;
 * - límite de miembros en las invitaciones;
 * - cuota de espacio (1 / 10 / 50 GB) al subir archivos.
 * El interruptor y la fecha se cambian en la instancia del servicio (se leen una
 * vez al arrancar y vienen apagados).
 */
describe('Plans enforcement (launch promo, premium templates, member limit)', () => {
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
        organizationName: 'Refugio Plan Encendido',
        displayName: 'Owner',
        email: `plans-on-${randomUUID()}@test.local`,
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

  let owner: Actor;
  const slug = `plan-on-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);

    owner = await registerOrg();
    await approveTestOrganization(admin, owner.orgId);
    await request(server).put('/org/profile').set(auth(owner.token)).send({ slug }).expect(200);
    // Con los planes apagados (hoy) la organización elige la plantilla de pago.
    await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: {}, template: 'historias' })
      .expect(200);
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

  it('with plans off nothing changes: the paid template shows and is not locked', async () => {
    const own = await request(server).get('/portals/theme').set(auth(owner.token)).expect(200);
    expect(own.body.template).toBe('historias');
    expect(own.body.lockedTemplate).toBeUndefined();
    expect(own.body.premiumDesignsAvailable).toBe(true);
    const pub = await request(server).get(`/public/organizations/${slug}/theme`).expect(200);
    expect(pub.body.template).toBe('historias');
  });

  it('during the launch promo an org without subscription is Pro and keeps the paid template', async () => {
    setEnforced(true);
    setPromoEnd(inDays(30));
    const view = await request(server).get('/org/plan').set(auth(owner.token)).expect(200);
    expect(view.body.effectivePlan).toBe('pro');
    expect(view.body.launchPromoEndsAt).not.toBeNull();
    const pub = await request(server).get(`/public/organizations/${slug}/theme`).expect(200);
    expect(pub.body.template).toBe('historias');
  });

  it('after the promo the portal falls back to a free template and the choice is kept', async () => {
    setEnforced(true);
    setPromoEnd(inDays(-1));
    const view = await request(server).get('/org/plan').set(auth(owner.token)).expect(200);
    expect(view.body.effectivePlan).toBe('free');
    expect(view.body.launchPromoEndsAt).toBeNull();

    const own = await request(server).get('/portals/theme').set(auth(owner.token)).expect(200);
    expect(own.body.template).toBe('clasica');
    expect(own.body.lockedTemplate).toBe('historias');
    expect(own.body.premiumDesignsAvailable).toBe(false);
    expect(own.body.coverVideoUrl).toBeUndefined();

    const pub = await request(server).get(`/public/organizations/${slug}/theme`).expect(200);
    expect(pub.body.template).toBe('clasica');
    // El público nunca ve qué plantilla quedó bloqueada.
    expect(pub.body.lockedTemplate).toBeUndefined();

    // Guardar colores sin cambiar de plantilla no borra la elección.
    await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: { primary: '142 72% 29%' } })
      .expect(200);
    const stored = await admin.portalTheme.findUnique({ where: { organizationId: owner.orgId } });
    expect((stored?.tokens as Record<string, unknown>).__template).toBe('historias');
  });

  it('choosing a paid template without a paid plan answers 403 PLAN_REQUIRED', async () => {
    setEnforced(true);
    setPromoEnd(inDays(-1));
    const res = await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: {}, template: 'historias' })
      .expect(403);
    expect(res.body).toMatchObject({
      code: 'PLAN_REQUIRED',
      capability: 'portalPremiumDesigns',
      requiredPlan: 'crece',
    });
    // Una gratuita sí se puede elegir.
    await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: {}, template: 'editorial' })
      .expect(200);
    await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: {}, template: 'historias' })
      .expect(403);
  });

  it('paying the monthly plan brings the paid template back', async () => {
    setEnforced(true);
    setPromoEnd(inDays(-1));
    await subscribe(owner.orgId, 'crece', inDays(30));
    await request(server)
      .put('/portals/theme')
      .set(auth(owner.token))
      .send({ tokens: {}, template: 'historias' })
      .expect(200);
    const pub = await request(server).get(`/public/organizations/${slug}/theme`).expect(200);
    expect(pub.body.template).toBe('historias');

    // Vence el pago y pasan los 15 días de gracia: vuelve a la gratuita.
    await subscribe(owner.orgId, 'crece', inDays(-16));
    const after = await request(server).get(`/public/organizations/${slug}/theme`).expect(200);
    expect(after.body.template).toBe('clasica');
  });

  it('invitations respect the members limit of the plan', async () => {
    setEnforced(true);
    setPromoEnd(inDays(-1));
    const invite = (email: string) =>
      request(server)
        .post('/org/invitations')
        .set(auth(owner.token))
        .send({ email, role: 'operator' });
    // Gratis: hasta 3 miembros. El dueño ocupa uno y dos invitaciones pendientes los otros.
    await invite(`m1-${randomUUID()}@test.local`).expect(201);
    await invite(`m2-${randomUUID()}@test.local`).expect(201);
    const full = await invite(`m3-${randomUUID()}@test.local`).expect(403);
    expect(full.body).toMatchObject({ code: 'PLAN_REQUIRED', limit: 'members' });

    // Con los planes apagados no hay límite.
    setEnforced(false);
    await invite(`m4-${randomUUID()}@test.local`).expect(201);
  });

  it('uploads respect the storage quota of the plan', async () => {
    const storage = app.get<StoragePort>(STORAGE_PORT);
    const key = `public/${owner.orgId}/${randomUUID()}-foto.jpg`;
    const upload = () =>
      request(server)
        .put('/storage/upload')
        .query({ key })
        .set(auth(owner.token))
        .attach('file', Buffer.from('fake-jpeg-bytes'), {
          filename: 'foto.jpg',
          contentType: 'image/jpeg',
        });
    // Gratis: 1 GB. Simulamos que ya está lleno.
    const measure = jest
      .spyOn(storage, 'measureOrganizationUsage')
      .mockResolvedValue(1024 * 1024 * 1024);
    try {
      setEnforced(true);
      setPromoEnd(inDays(-1));
      const full = await upload().expect(403);
      expect(full.body).toMatchObject({ code: 'PLAN_REQUIRED', limit: 'storageMb' });
      const view = await request(server).get('/org/plan').set(auth(owner.token)).expect(200);
      expect(view.body.usage.storageMb).toBe(1024);

      // Con Crece (10 GB) sí cabe.
      await subscribe(owner.orgId, 'crece', inDays(30));
      await upload().expect(200);

      // Con los planes apagados no hay cuota.
      await admin.organizationSubscription.deleteMany({ where: { organizationId: owner.orgId } });
      setEnforced(false);
      await upload().expect(200);
    } finally {
      measure.mockRestore();
    }
  });
});
