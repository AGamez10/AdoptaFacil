import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import sharp from 'sharp';
import { PLAN_CATALOG, type PlanKey } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { OrgEmailBrandingService } from '../src/core/notifications/branding/org-email-branding.service';
import { PlansService } from '../src/core/plans/plans.service';
import { STORAGE_PORT, type StoragePort } from '../src/core/storage/storage.port';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

/**
 * Matriz de derechos por plan, con los planes ENCENDIDOS (`PLAN_ENFORCEMENT`) y
 * la promoción de lanzamiento ya terminada. Recorre Gratis, Crece y Pro y, para
 * cada derecho que el servidor hace cumplir, prueba por HTTP (o por el servicio
 * que envía los correos) que se habilita en el plan que lo incluye y se bloquea
 * con 403 `PLAN_REQUIRED` en el que no. Después recorre el ciclo de vida de una
 * suscripción: contratar, subir, bajar, pago vencido con gracia, vencido sin
 * gracia y cancelado.
 *
 * Lo que este archivo NO prueba porque el servidor no lo hace cumplir hoy está
 * en `docs/planes/verificacion-planes.md` (personalización avanzada, soporte
 * prioritario, dominio propio, patrocinio de empresas, cobro automático).
 */
async function withOrgContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

describe('Plan entitlements matrix (free / crece / pro, enforced)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  let branding: OrgEmailBrandingService;
  let storage: StoragePort;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
  // El período del reporte va en días de Colombia (UTC-5), no de UTC.
  const inDaysIso = (iso: string) => new Date(iso).toISOString();
  const ymd = (d: Date) => new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: 'Owner',
        email: `matrix-${randomUUID()}@test.local`,
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

  /** Deja a la organización en `plan` (Gratis = sin suscripción). */
  async function onPlan(orgId: string, plan: PlanKey, status = 'active', end = inDays(30)) {
    if (plan === 'free') {
      await admin.organizationSubscription.deleteMany({ where: { organizationId: orgId } });
      return;
    }
    await admin.organizationSubscription.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, plan, status, currentPeriodEnd: end },
      update: { plan, status, currentPeriodEnd: end },
    });
  }

  let photo: Buffer;
  const upload = (actor: Actor) =>
    request(server)
      .put('/storage/upload')
      .query({ key: `public/${actor.orgId}/${randomUUID()}-foto.jpg` })
      .set(auth(actor.token))
      .attach('file', photo, { filename: 'foto.jpg', contentType: 'image/jpeg' });

  const publicTheme = (slug: string) =>
    request(server).get(`/public/organizations/${slug}/theme`).expect(200);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);
    branding = app.get(OrgEmailBrandingService);
    storage = app.get<StoragePort>(STORAGE_PORT);
    photo = await sharp({
      create: { width: 32, height: 24, channels: 3, background: { r: 10, g: 90, b: 60 } },
    })
      .jpeg()
      .toBuffer();
  });

  beforeEach(() => {
    setEnforced(true);
    setPromoEnd(inDays(-1));
  });

  afterEach(() => {
    setEnforced(false);
    setPromoEnd(null);
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  // ── 1. Derechos por plan ────────────────────────────────────────────────
  describe.each(['free', 'crece', 'pro'] as const)('plan %s', (plan) => {
    const def = PLAN_CATALOG[plan];
    let org: Actor;
    const slug = `matrix-${plan}-${randomUUID().slice(0, 8)}`;

    beforeAll(async () => {
      org = await registerOrg(`Refugio Matriz ${plan}`);
      await approveTestOrganization(admin, org.orgId);
      await request(server).put('/org/profile').set(auth(org.token)).send({ slug }).expect(200);
    });

    beforeEach(() => onPlan(org.orgId, plan));

    it('GET /org/plan reports this plan, its limits and its capabilities', async () => {
      const view = await request(server).get('/org/plan').set(auth(org.token)).expect(200);
      expect(view.body.enforced).toBe(true);
      expect(view.body.effectivePlan).toBe(plan);
      expect(view.body.limits).toEqual(def.limits);
      expect(view.body.capabilities).toEqual(def.capabilities);
    });

    it(`dataExport (Excel) → ${def.capabilities.dataExport ? '200' : '403'}`, async () => {
      const res = await request(server).get('/org/exports/data.xlsx').set(auth(org.token));
      if (def.capabilities.dataExport) {
        expect(res.status).toBe(200);
      } else {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'PLAN_REQUIRED', capability: 'dataExport' });
      }
    });

    it(`impactReport (PDF) → ${def.capabilities.impactReport ? '200' : '403'}`, async () => {
      const res = await request(server)
        .get(`/org/exports/impact-report.pdf?start=${ymd(inDays(-30))}&end=${ymd(new Date())}`)
        .set(auth(org.token));
      if (def.capabilities.impactReport) {
        expect(res.status).toBe(200);
      } else {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'PLAN_REQUIRED', capability: 'impactReport' });
      }
    });

    it(`portalPremiumDesigns (plantilla "historias") → ${def.capabilities.portalPremiumDesigns ? '200' : '403'}`, async () => {
      const res = await request(server)
        .put('/portals/theme')
        .set(auth(org.token))
        .send({ tokens: {}, template: 'historias' });
      if (def.capabilities.portalPremiumDesigns) {
        expect(res.status).toBe(200);
        expect((await publicTheme(slug)).body.template).toBe('historias');
      } else {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({
          code: 'PLAN_REQUIRED',
          capability: 'portalPremiumDesigns',
        });
      }
      // Las plantillas gratuitas se pueden elegir en cualquier plan.
      await request(server)
        .put('/portals/theme')
        .set(auth(org.token))
        .send({ tokens: {}, template: 'editorial' })
        .expect(200);
    });

    it(`portalRemoveSeal (quitar sello) → ${def.capabilities.portalRemoveSeal ? '200' : '403'}`, async () => {
      const res = await request(server)
        .put('/portals/theme')
        .set(auth(org.token))
        .send({ tokens: {}, hideSeal: true });
      if (def.capabilities.portalRemoveSeal) {
        expect(res.status).toBe(200);
        expect((await publicTheme(slug)).body.hideSeal).toBe(true);
      } else {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'PLAN_REQUIRED', capability: 'portalRemoveSeal' });
        expect((await publicTheme(slug)).body.hideSeal).toBe(false);
      }
    });

    it(`brandedEmails → ${def.capabilities.brandedEmails ? 'con la marca de la organización' : 'con la marca de AdoptaFácil'}`, async () => {
      const claimed = await branding.claim(org.orgId);
      if (def.capabilities.brandedEmails) {
        expect(claimed).not.toBeNull();
        expect(claimed?.organizationName).toBe(`Refugio Matriz ${plan}`);
      } else {
        expect(claimed).toBeNull();
      }
    });

    it(`storageMb: lleno a ${def.limits.storageMb} MB → 403; con espacio → 200`, async () => {
      const limitBytes = (def.limits.storageMb as number) * 1024 * 1024;
      const measure = jest.spyOn(storage, 'measureOrganizationUsage');
      measure.mockResolvedValue(limitBytes);
      const full = await upload(org).expect(403);
      expect(full.body).toMatchObject({ code: 'PLAN_REQUIRED', limit: 'storageMb' });
      measure.mockResolvedValue(limitBytes - 10 * 1024 * 1024);
      await upload(org).expect(200);
    });
  });

  // ── 2. Límite de miembros (invitaciones y asignación directa de roles) ───
  describe('members limit', () => {
    let org: Actor;
    const invite = (actor: Actor) =>
      request(server)
        .post('/org/invitations')
        .set(auth(actor.token))
        .send({ email: `m-${randomUUID()}@test.local`, role: 'operator' });

    beforeAll(async () => {
      org = await registerOrg('Refugio Matriz Miembros');
      await approveTestOrganization(admin, org.orgId);
    });

    afterAll(() =>
      admin.organizationInvitation.deleteMany({ where: { organizationId: org.orgId } }),
    );

    it('Gratis admite 3, Crece 10 y Pro sin límite (el dueño ocupa un puesto)', async () => {
      await onPlan(org.orgId, 'free');
      await invite(org).expect(201);
      await invite(org).expect(201);
      expect((await invite(org).expect(403)).body).toMatchObject({
        code: 'PLAN_REQUIRED',
        limit: 'members',
        requiredPlan: 'crece',
      });

      await onPlan(org.orgId, 'crece');
      for (let i = 0; i < 7; i += 1) await invite(org).expect(201);
      expect((await invite(org).expect(403)).body).toMatchObject({
        limit: 'members',
        requiredPlan: 'pro',
      });

      await onPlan(org.orgId, 'pro');
      for (let i = 0; i < 3; i += 1) await invite(org).expect(201);
    });

    it('dar el primer rol a alguien sin rol respeta el tope; un rol más a un miembro, no', async () => {
      const own = await registerOrg('Refugio Matriz Roles');
      await approveTestOrganization(admin, own.orgId);
      const newUser = async () =>
        (
          await withOrgContext(admin, own.orgId, (tx) =>
            tx.user.create({
              data: {
                organizationId: own.orgId,
                accountType: 'person',
                email: `r-${randomUUID()}@test.local`,
                displayName: 'Persona',
              },
            }),
          )
        ).id;
      const assign = (userId: string, role: string) =>
        request(server).post('/rbac/roles').set(auth(own.token)).send({ userId, role });

      await onPlan(own.orgId, 'free');
      const second = await newUser();
      const third = await newUser();
      const fourth = await newUser();
      await assign(second, 'operator').expect(201);
      await assign(third, 'operator').expect(201);
      // Gratis: dueño + 2 = 3. Un cuarto miembro por asignación directa no entra.
      expect((await assign(fourth, 'operator').expect(403)).body).toMatchObject({
        code: 'PLAN_REQUIRED',
        limit: 'members',
      });
      // A quien ya es miembro sí se le puede dar otro rol.
      await assign(second, 'veterinarian').expect(201);
      // Con los planes apagados, sin límite.
      setEnforced(false);
      await assign(fourth, 'operator').expect(201);
    });
  });

  // ── 3. Ciclo de vida de la suscripción ──────────────────────────────────
  describe('subscription lifecycle', () => {
    let org: Actor;
    const slug = `matrix-life-${randomUUID().slice(0, 8)}`;
    const effective = async () =>
      (await request(server).get('/org/plan').set(auth(org.token)).expect(200)).body;

    beforeAll(async () => {
      org = await registerOrg('Refugio Matriz Ciclo');
      await approveTestOrganization(admin, org.orgId);
      await request(server).put('/org/profile').set(auth(org.token)).send({ slug }).expect(200);
    });

    it('sin suscripción y sin promoción = Gratis; con promoción vigente = Pro', async () => {
      await onPlan(org.orgId, 'free');
      expect((await effective()).effectivePlan).toBe('free');
      setPromoEnd(inDays(10));
      expect((await effective()).effectivePlan).toBe('pro');
    });

    it('con los planes apagados (valor por defecto) toda organización es Pro', async () => {
      await onPlan(org.orgId, 'free');
      setEnforced(false);
      const view = await effective();
      expect(view.enforced).toBe(false);
      expect(view.effectivePlan).toBe('pro');
    });

    it('la plataforma activa Crece por la API y el cambio rige de inmediato', async () => {
      await onPlan(org.orgId, 'free');
      const platform = await registerOrg('Plataforma Matriz');
      await admin.userRole.create({
        data: { organizationId: platform.orgId, userId: platform.userId, role: 'platform_admin' },
      });
      await request(server)
        .put(`/platform/organizations/${org.orgId}/plan`)
        .set(auth(platform.token))
        .send({ plan: 'crece', status: 'active', currentPeriodEnd: inDays(30).toISOString() })
        .expect(200);
      expect((await effective()).effectivePlan).toBe('crece');
      // Una organización no se puede asignar un plan a sí misma.
      await request(server)
        .put(`/platform/organizations/${org.orgId}/plan`)
        .set(auth(org.token))
        .send({ plan: 'pro', status: 'active', currentPeriodEnd: inDays(30).toISOString() })
        .expect(403);
    });

    it('subir de Crece a Pro rige de inmediato', async () => {
      await onPlan(org.orgId, 'pro');
      expect((await effective()).effectivePlan).toBe('pro');
    });

    it('bajar de plan no borra nada: la elección queda guardada y vuelve al pagar', async () => {
      await onPlan(org.orgId, 'crece');
      await request(server)
        .put('/portals/theme')
        .set(auth(org.token))
        .send({ tokens: {}, template: 'historias', hideSeal: true })
        .expect(200);
      expect((await publicTheme(slug)).body).toMatchObject({
        template: 'historias',
        hideSeal: true,
      });

      await onPlan(org.orgId, 'free');
      const pub = (await publicTheme(slug)).body;
      expect(pub.template).toBe('clasica');
      expect(pub.hideSeal).toBe(false);
      const stored = await admin.portalTheme.findUnique({ where: { organizationId: org.orgId } });
      expect(stored?.hideSeal).toBe(true);
      expect((stored?.tokens as Record<string, unknown>).__template).toBe('historias');

      await onPlan(org.orgId, 'crece');
      expect((await publicTheme(slug)).body).toMatchObject({
        template: 'historias',
        hideSeal: true,
      });
    });

    it('pago vencido (past_due) sigue funcionando durante los 15 días de gracia', async () => {
      await onPlan(org.orgId, 'crece', 'past_due', inDays(-5));
      const view = await effective();
      expect(view.effectivePlan).toBe('crece');
      expect(view.graceEndsAt).not.toBeNull();
    });

    it('vencido y pasada la gracia vuelve a Gratis (sin que nadie haga nada)', async () => {
      await onPlan(org.orgId, 'crece', 'active', inDays(-16));
      expect((await effective()).effectivePlan).toBe('free');
      await request(server).get('/org/exports/data.xlsx').set(auth(org.token)).expect(403);
    });

    it('cancelado conserva lo ya pagado hasta el fin del periodo, sin gracia', async () => {
      await onPlan(org.orgId, 'pro', 'canceled', inDays(20));
      const view = await effective();
      expect(view.effectivePlan).toBe('pro');
      expect(view.graceEndsAt).toBe(inDaysIso(view.subscription.currentPeriodEnd));
      await onPlan(org.orgId, 'pro', 'canceled', inDays(-1));
      expect((await effective()).effectivePlan).toBe('free');
    });

    it('cancelado por la plataforma sin periodo = Gratis de inmediato', async () => {
      await admin.organizationSubscription.upsert({
        where: { organizationId: org.orgId },
        create: {
          organizationId: org.orgId,
          plan: 'pro',
          status: 'canceled',
          currentPeriodEnd: null,
        },
        update: { plan: 'pro', status: 'canceled', currentPeriodEnd: null },
      });
      expect((await effective()).effectivePlan).toBe('free');
    });
  });
});
