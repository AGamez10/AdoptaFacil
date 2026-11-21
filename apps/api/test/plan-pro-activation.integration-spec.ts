import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PLAN_CATALOG, PLAN_CAPABILITY_INFO, type PlanCapability } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { OrgEmailBrandingService } from '../src/core/notifications/branding/org-email-branding.service';
import {
  NOTIFICATION_PORT,
  type NotificationMessage,
  type NotificationPort,
} from '../src/core/notifications/notification.port';
import {
  MercadoPagoBillingClient,
  type MercadoPagoAuthorizedPayment,
  type MercadoPagoPreapproval,
} from '../src/core/payments/mercadopago-billing.client';
import { mercadoPagoSignatureV1 } from '../src/core/payments/mercadopago-payment.adapter';
import { PlanBillingService } from '../src/core/plans/plan-billing.service';
import { PlansService } from '../src/core/plans/plans.service';
import { PortalDomainService } from '../src/modules/portals/portal-domain.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

const SECRET = 'test-webhook-secret-pro';

/** Mercado Pago (cuenta de AdoptaFácil) sin red, como en el sandbox. */
class FakeBillingClient {
  preapprovals = new Map<string, MercadoPagoPreapproval>();
  charges = new Map<string, MercadoPagoAuthorizedPayment>();
  cancelled: string[] = [];
  private seq = 0;

  isConfigured(): boolean {
    return true;
  }

  async createMonthlySubscription(input: {
    externalReference: string;
    amountCop: number;
  }): Promise<{ id: string; checkoutUrl: string }> {
    const id = `prepro${++this.seq}${randomUUID().slice(0, 6)}`;
    this.preapprovals.set(id, {
      id,
      status: 'pending',
      externalReference: input.externalReference,
      amount: input.amountCop,
      currency: 'COP',
      frequency: 1,
      frequencyType: 'months',
      nextPaymentDate: null,
      initPoint: null,
    });
    return {
      id,
      checkoutUrl: `https://www.mercadopago.com.co/subscriptions/checkout?preapproval_id=${id}`,
    };
  }

  async getPreapproval(id: string): Promise<MercadoPagoPreapproval> {
    const p = this.preapprovals.get(id);
    if (!p) throw new Error('not found');
    return p;
  }

  async getAuthorizedPayment(id: string): Promise<MercadoPagoAuthorizedPayment> {
    const c = this.charges.get(id);
    if (!c) throw new Error('not found');
    return c;
  }

  async cancelPreapproval(id: string): Promise<void> {
    this.cancelled.push(id);
    const p = this.preapprovals.get(id);
    if (p) p.status = 'cancelled';
  }
}

/**
 * De punta a punta, con los planes ENCENDIDOS y sin promoción ni prueba: una
 * organización en Gratis paga Pro (o Crece) con Mercado Pago simulado y, sin
 * que nadie de la plataforma toque nada, el servidor habilita TODO lo que la
 * tarjeta del plan promete (`PLAN_CATALOG` / `planHighlights`, lo mismo que
 * muestran la landing y "Plan y facturación"), avisa al dueño por correo con
 * la plantilla de AdoptaFácil y, al cancelar y terminar lo pagado, vuelve a
 * Gratis sin borrar nada.
 */
describe('Pagar un plan activa lo que promete (Mercado Pago simulado, de punta a punta)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  let branding: OrgEmailBrandingService;
  let domains: PortalDomainService;
  let notifications: NotificationPort;
  const fake = new FakeBillingClient();
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  interface Actor {
    token: string;
    orgId: string;
    email: string;
    slug: string;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const ymd = (d: Date) => new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

  async function registerOrg(name: string): Promise<Actor> {
    const email = `pro-${randomUUID()}@test.local`;
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: name,
        displayName: 'Owner',
        email,
        password: 'password-plans-123',
      })
      .expect(201);
    const orgId = res.body.user.organizationId as string;
    createdOrgIds.push(orgId);
    await approveTestOrganization(admin, orgId);
    const token = res.body.tokens.accessToken as string;
    const slug = `pro-e2e-${randomUUID().slice(0, 8)}`;
    await request(server).put('/org/profile').set(auth(token)).send({ slug }).expect(200);
    return { token, orgId, email, slug };
  }

  function notify(type: string, dataId: string) {
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = randomUUID();
    return request(server)
      .post('/billing/webhooks/mercadopago')
      .query({ type, 'data.id': dataId })
      .set('x-signature', `ts=${ts},v1=${mercadoPagoSignatureV1(SECRET, dataId, requestId, ts)}`)
      .set('x-request-id', requestId)
      .send({ type, data: { id: dataId } });
  }

  /** Lo que hace la persona: pagar en Mercado Pago, que autoriza y cobra. */
  async function pay(actor: Actor, plan: 'crece' | 'pro'): Promise<{ id: string; charge: string }> {
    const res = await request(server)
      .post('/org/plan/checkout')
      .set(auth(actor.token))
      .send({ plan })
      .expect(200);
    const id = new URL(res.body.checkoutUrl).searchParams.get('preapproval_id') as string;
    const pre = fake.preapprovals.get(id) as MercadoPagoPreapproval;
    pre.status = 'authorized';
    await notify('subscription_preapproval', id).expect(200);
    const charge = `chpro${randomUUID().slice(0, 8)}`;
    fake.charges.set(charge, {
      id: charge,
      preapprovalId: id,
      paymentStatus: 'approved',
      amount: pre.amount,
      currency: 'COP',
      chargedAt: new Date(),
    });
    await notify('subscription_authorized_payment', charge).expect(200);
    return { id, charge };
  }

  const planView = async (actor: Actor) =>
    (await request(server).get('/org/plan').set(auth(actor.token)).expect(200)).body;
  const publicTheme = async (slug: string) =>
    (await request(server).get(`/public/organizations/${slug}/theme`).expect(200)).body;

  /** Lo que la pantalla de contabilidad dice que la organización puede usar. */
  const accounting = async (a: Actor) =>
    (await request(server).get('/org/accounting').set(auth(a.token)).expect(200)).body.features as {
      close: boolean;
      fullExport: boolean;
      accountantPackage: boolean;
    };

  /**
   * Cada derecho que el servidor hace cumplir, probado por HTTP. Devuelve
   * `true` cuando la organización lo tiene hoy. Los que no tienen código
   * (soporte prioritario: proceso del equipo; patrocinio: próximamente) se
   * leen de `GET /org/plan`.
   */
  const probes: Partial<Record<PlanCapability, (a: Actor) => Promise<boolean>>> = {
    dataExport: async (a) =>
      (await request(server).get('/org/exports/data.xlsx').set(auth(a.token))).status === 200,
    impactReport: async (a) => {
      const now = new Date();
      const start = ymd(new Date(now.getTime() - 30 * 86_400_000));
      const res = await request(server)
        .get(`/org/exports/impact-report.pdf?start=${start}&end=${ymd(now)}`)
        .set(auth(a.token));
      return res.status === 200;
    },
    portalPremiumDesigns: async (a) =>
      (
        await request(server)
          .put('/portals/theme')
          .set(auth(a.token))
          .send({ tokens: {}, template: 'documental' })
      ).status === 200,
    portalRemoveSeal: async (a) =>
      (
        await request(server)
          .put('/portals/theme')
          .set(auth(a.token))
          .send({ tokens: {}, hideSeal: true })
      ).status === 200,
    customDomain: async (a) =>
      (
        await request(server)
          .put('/org/portal/domain')
          .set(auth(a.token))
          .send({ domain: `www.refugio-${randomUUID().slice(0, 8)}.org` })
      ).status === 200,
    brandedEmails: async (a) => (await branding.claim(a.orgId)) !== null,
    accountingClose: async (a) => (await accounting(a)).close === true,
    accountingFullExport: async (a) => (await accounting(a)).fullExport === true,
    accountantPackage: async (a) => (await accounting(a)).accountantPackage === true,
  };

  async function probeAll(actor: Actor): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    for (const [capability, probe] of Object.entries(probes)) {
      out[capability] = await (probe as (a: Actor) => Promise<boolean>)(actor);
    }
    return out;
  }

  const expected = (plan: 'free' | 'crece' | 'pro') =>
    Object.fromEntries(
      Object.keys(probes).map((c) => [c, PLAN_CATALOG[plan].capabilities[c as PlanCapability]]),
    );

  let sent: NotificationMessage[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MercadoPagoBillingClient)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);
    branding = app.get(OrgEmailBrandingService);
    domains = app.get(PortalDomainService);
    notifications = app.get<NotificationPort>(NOTIFICATION_PORT);
    Object.defineProperty(app.get(PlanBillingService), 'webhookSecret', {
      value: SECRET,
      configurable: true,
    });
    // El dominio propio necesita la configuración de la plataforma (CNAME destino).
    Object.defineProperty(domains, 'target', {
      value: 'portales.adoptafacil.test',
      configurable: true,
    });
  });

  beforeEach(() => {
    Object.defineProperty(plans, 'enforced', { value: true, configurable: true });
    Object.defineProperty(plans, 'promoEndsAt', { value: null, configurable: true });
    Object.defineProperty(plans, 'trialDays', { value: 0, configurable: true });
    sent = [];
    const original = notifications.send.bind(notifications);
    jest.spyOn(notifications, 'send').mockImplementation(async (message) => {
      sent.push(message);
      return original(message);
    });
  });

  afterEach(() => {
    Object.defineProperty(plans, 'enforced', { value: false, configurable: true });
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('Gratis → paga Pro → todo lo de Pro queda habilitado sin intervención, y el dueño recibe el aviso', async () => {
    const org = await registerOrg('Refugio Paga Pro');

    // Antes de pagar: Gratis, con todo lo de pago bloqueado.
    expect((await planView(org)).effectivePlan).toBe('free');
    expect(await probeAll(org)).toEqual(expected('free'));
    await expect(plans.assertWithinLimit(org.orgId, 'members', 4)).rejects.toMatchObject({
      response: { code: 'PLAN_REQUIRED', limit: 'members' },
    });

    const { id, charge } = await pay(org, 'pro');

    // Después: lo que dice la tarjeta de Pro, igual a lo que el servidor permite.
    const view = await planView(org);
    expect(view.effectivePlan).toBe('pro');
    expect(view.subscription).toMatchObject({
      status: 'active',
      provider: 'mercadopago',
      providerReference: id,
    });
    expect(view.capabilities).toEqual(PLAN_CATALOG.pro.capabilities);
    expect(view.limits).toEqual(PLAN_CATALOG.pro.limits);
    expect(view.usage.brandedEmails).toEqual({ sent: expect.any(Number), limit: 20_000 });
    expect(await probeAll(org)).toEqual(expected('pro'));
    // Equipo sin límite de personas.
    await expect(plans.assertWithinLimit(org.orgId, 'members', 500)).resolves.toBeUndefined();
    // Plantilla Pro y sin sello, visibles en el portal público.
    expect(await publicTheme(org.slug)).toMatchObject({ template: 'documental', hideSeal: true });
    // Dominio propio: la pantalla ya lo ofrece.
    expect(
      (await request(server).get('/org/portal/domain').set(auth(org.token)).expect(200)).body
        .planIncludes,
    ).toBe(true);
    // Lo que se vende sin código propio está marcado como tal en el catálogo.
    expect(PLAN_CAPABILITY_INFO.corporateSponsorship.available).toBe(false);
    expect(view.capabilities.prioritySupport).toBe(true);

    // Aviso al dueño, con la plantilla de AdoptaFácil y lo que quedó habilitado.
    const activated = sent.filter((m) => m.template?.event === 'plan.activated');
    expect(activated).toHaveLength(1);
    expect(activated[0]).toMatchObject({ to: org.email });
    expect(activated[0].template?.data).toMatchObject({ plan: 'Pro' });
    expect(String(activated[0].template?.data.beneficios)).toContain('Dominio propio');
    expect(String(activated[0].template?.data.beneficios)).not.toContain('Patrocinio');

    // Mercado Pago repite la notificación: nada cambia y no se avisa dos veces.
    await notify('subscription_authorized_payment', charge).expect(200);
    expect(sent.filter((m) => m.template?.event === 'plan.activated')).toHaveLength(1);
  });

  it('cancelar: sigue en Pro hasta el fin de lo pagado; después Gratis sin borrar nada, y al volver a pagar regresa todo', async () => {
    const org = await registerOrg('Refugio Cancela Pro');
    await pay(org, 'pro');
    await request(server)
      .put('/portals/theme')
      .set(auth(org.token))
      .send({ tokens: {}, template: 'documental', hideSeal: true })
      .expect(200);

    await request(server).post('/org/plan/cancel').set(auth(org.token)).expect(200);
    expect((await planView(org)).effectivePlan).toBe('pro');
    expect(await probeAll(org)).toEqual(expected('pro'));

    // Termina el periodo pagado (cancelado = sin días de gracia).
    await admin.organizationSubscription.update({
      where: { organizationId: org.orgId },
      data: { currentPeriodEnd: new Date(Date.now() - 60_000) },
    });
    expect((await planView(org)).effectivePlan).toBe('free');
    const pub = await publicTheme(org.slug);
    expect(pub.template).not.toBe('documental');
    expect(pub.hideSeal).toBe(false);
    expect(
      (await request(server).get('/org/exports/data.xlsx').set(auth(org.token))).body,
    ).toMatchObject({ code: 'PLAN_REQUIRED' });
    const stored = await admin.portalTheme.findUnique({ where: { organizationId: org.orgId } });
    expect(stored?.hideSeal).toBe(true);
    expect((stored?.tokens as Record<string, unknown>).__template).toBe('documental');

    // Vuelve a pagar: la plantilla y el "sin sello" que eligió regresan solos.
    await pay(org, 'pro');
    expect((await planView(org)).effectivePlan).toBe('pro');
    expect(await publicTheme(org.slug)).toMatchObject({ template: 'documental', hideSeal: true });
  });

  it('pagar Crece habilita lo de Crece y nada de lo exclusivo de Pro', async () => {
    const org = await registerOrg('Refugio Paga Crece');
    await pay(org, 'crece');
    const view = await planView(org);
    expect(view.effectivePlan).toBe('crece');
    expect(view.capabilities).toEqual(PLAN_CATALOG.crece.capabilities);
    expect(await probeAll(org)).toEqual(expected('crece'));
    expect(view.capabilities.customDomain).toBe(false);
    expect(view.capabilities.prioritySupport).toBe(false);
    await expect(plans.assertWithinLimit(org.orgId, 'members', 10)).resolves.toBeUndefined();
    await expect(plans.assertWithinLimit(org.orgId, 'members', 11)).rejects.toMatchObject({
      response: { requiredPlan: 'pro' },
    });

    // Sube a Pro: rige con el primer cobro, la suscripción de Crece se cancela.
    const crece = view.subscription.providerReference as string;
    await pay(org, 'pro');
    expect((await planView(org)).effectivePlan).toBe('pro');
    expect(fake.cancelled).toContain(crece);
    expect(await probeAll(org)).toEqual(expected('pro'));
    const avisos = sent.filter((m) => m.template?.event === 'plan.activated');
    expect(avisos.map((m) => m.template?.data.plan)).toEqual(['Crece', 'Pro']);
  });
});
