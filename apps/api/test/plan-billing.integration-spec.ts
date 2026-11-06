import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { priceWithIva, PLAN_CATALOG } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../src/core/notifications/notification.port';
import {
  MercadoPagoBillingClient,
  type MercadoPagoAuthorizedPayment,
  type MercadoPagoPreapproval,
} from '../src/core/payments/mercadopago-billing.client';
import { mercadoPagoSignatureV1 } from '../src/core/payments/mercadopago-payment.adapter';
import { PlanBillingService } from '../src/core/plans/plan-billing.service';
import { PlanRemindersService } from '../src/core/plans/plan-reminders.service';
import { PlansService } from '../src/core/plans/plans.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';

const SECRET = 'test-webhook-secret';

/** Mercado Pago (cuenta de AdoptaFácil) sin red: guarda suscripciones y cobros en memoria. */
class FakeBillingClient {
  preapprovals = new Map<string, MercadoPagoPreapproval>();
  charges = new Map<string, MercadoPagoAuthorizedPayment>();
  cancelled: string[] = [];
  failCancel = false;
  private seq = 0;

  isConfigured(): boolean {
    return true;
  }

  async createMonthlySubscription(input: {
    externalReference: string;
    amountCop: number;
  }): Promise<{ id: string; checkoutUrl: string }> {
    const id = `pre${++this.seq}${randomUUID().slice(0, 6)}`;
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
    if (this.failCancel) throw new Error('gateway down');
    this.cancelled.push(id);
    const p = this.preapprovals.get(id);
    if (p) p.status = 'cancelled';
  }
}

describe('Plan billing with Mercado Pago (checkout, renewal, failed charge, upgrade, cancel, reminders)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let plans: PlansService;
  let reminders: PlanRemindersService;
  let notifications: NotificationPort;
  const fake = new FakeBillingClient();
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  /** Cada organización registrada; los avisos reutilizan algunas (el registro tiene límite de intentos). */
  const actors: Actor[] = [];

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
    email: string;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
  const setEnforced = (value: boolean) =>
    Object.defineProperty(plans, 'enforced', { value, configurable: true });

  async function registerOrg(name: string): Promise<Actor> {
    const email = `billing-${randomUUID()}@test.local`;
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
    createdOrgIds.push(res.body.user.organizationId);
    await approveTestOrganization(admin, res.body.user.organizationId);
    const actor = {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
      email,
    };
    actors.push(actor);
    return actor;
  }

  /** Envía una notificación firmada como lo hace Mercado Pago. */
  function notify(type: string, dataId: string, valid = true) {
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = randomUUID();
    const v1 = valid ? mercadoPagoSignatureV1(SECRET, dataId, requestId, ts) : 'deadbeef';
    return request(server)
      .post('/billing/webhooks/mercadopago')
      .query({ type, 'data.id': dataId })
      .set('x-signature', `ts=${ts},v1=${v1}`)
      .set('x-request-id', requestId)
      .send({ type, data: { id: dataId } });
  }

  const planOf = async (actor: Actor) =>
    (await request(server).get('/org/plan').set(auth(actor.token)).expect(200)).body;
  const row = (orgId: string) =>
    admin.organizationSubscription.findUnique({ where: { organizationId: orgId } });

  async function checkoutAndAuthorize(actor: Actor, plan: 'crece' | 'pro'): Promise<string> {
    const res = await request(server)
      .post('/org/plan/checkout')
      .set(auth(actor.token))
      .send({ plan })
      .expect(200);
    const id = new URL(res.body.checkoutUrl).searchParams.get('preapproval_id') as string;
    const pre = fake.preapprovals.get(id) as MercadoPagoPreapproval;
    pre.status = 'authorized';
    pre.nextPaymentDate = inDays(30);
    await notify('subscription_preapproval', id).expect(200);
    // Autorizar no activa el plan (#92): solo un cobro aprobado lo hace.
    const first = `ch${randomUUID().slice(0, 8)}`;
    fake.charges.set(first, {
      id: first,
      preapprovalId: id,
      paymentStatus: 'approved',
      amount: pre.amount,
      currency: 'COP',
      chargedAt: new Date(),
    });
    await notify('subscription_authorized_payment', first).expect(200);
    return id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MercadoPagoBillingClient)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    plans = app.get(PlansService);
    reminders = app.get(PlanRemindersService);
    notifications = app.get<NotificationPort>(NOTIFICATION_PORT);
    Object.defineProperty(app.get(PlanBillingService), 'webhookSecret', { value: SECRET });
  });

  beforeEach(() => {
    setEnforced(true);
    Object.defineProperty(plans, 'promoEndsAt', { value: null, configurable: true });
    fake.failCancel = false;
  });

  afterEach(() => {
    setEnforced(false);
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('con los planes apagados no se puede pagar (todo es gratis durante el piloto)', async () => {
    const org = await registerOrg('Refugio Cobro Apagado');
    setEnforced(false);
    await request(server)
      .post('/org/plan/checkout')
      .set(auth(org.token))
      .send({ plan: 'crece' })
      .expect(409);
  });

  it('contratar: el primer cobro aprobado activa el plan con el monto con IVA', async () => {
    const org = await registerOrg('Refugio Contrata');
    const id = await checkoutAndAuthorize(org, 'crece');
    expect(fake.preapprovals.get(id)?.amount).toBe(
      priceWithIva(PLAN_CATALOG.crece.monthlyPriceCop),
    );
    const view = await planOf(org);
    expect(view.effectivePlan).toBe('crece');
    expect(view.subscription).toMatchObject({
      provider: 'mercadopago',
      providerReference: id,
      status: 'active',
    });
  });

  it('una firma inválida se rechaza; autorizar sin cobro aprobado no activa el plan', async () => {
    const org = await registerOrg('Refugio Firma');
    const res = await request(server)
      .post('/org/plan/checkout')
      .set(auth(org.token))
      .send({ plan: 'pro' })
      .expect(200);
    const id = new URL(res.body.checkoutUrl).searchParams.get('preapproval_id') as string;
    (fake.preapprovals.get(id) as MercadoPagoPreapproval).status = 'authorized';
    await notify('subscription_preapproval', id, false).expect(403);
    expect(await row(org.orgId)).toBeNull();
    // Con firma válida, autorizar sin un cobro aprobado tampoco activa el plan (sin mes gratis).
    await notify('subscription_preapproval', id).expect(200);
    expect((await planOf(org)).effectivePlan).toBe('free');
  });

  it('renovación: cada cobro aprobado extiende el periodo un mes', async () => {
    const org = await registerOrg('Refugio Renueva');
    const id = await checkoutAndAuthorize(org, 'crece');
    const before = (await row(org.orgId))?.currentPeriodEnd as Date;
    const chargeId = `ch${randomUUID().slice(0, 8)}`;
    fake.charges.set(chargeId, {
      id: chargeId,
      preapprovalId: id,
      paymentStatus: 'approved',
      amount: priceWithIva(PLAN_CATALOG.crece.monthlyPriceCop),
      currency: 'COP',
      chargedAt: inDays(29),
    });
    await notify('subscription_authorized_payment', chargeId).expect(200);
    const after = (await row(org.orgId))?.currentPeriodEnd as Date;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
    // La misma notificación repetida no cambia nada (idempotente).
    await notify('subscription_authorized_payment', chargeId).expect(200);
    expect((await row(org.orgId))?.currentPeriodEnd?.getTime()).toBe(after.getTime());
  });

  it('cobro rechazado: pasa a pago vencido y el plan sigue con días de gracia; un cobro aprobado lo reactiva', async () => {
    const org = await registerOrg('Refugio Rechazo');
    const id = await checkoutAndAuthorize(org, 'crece');
    const rejected = `ch${randomUUID().slice(0, 8)}`;
    fake.charges.set(rejected, {
      id: rejected,
      preapprovalId: id,
      paymentStatus: 'rejected',
      amount: priceWithIva(PLAN_CATALOG.crece.monthlyPriceCop),
      currency: 'COP',
      chargedAt: new Date(),
    });
    await notify('subscription_authorized_payment', rejected).expect(200);
    expect((await row(org.orgId))?.status).toBe('past_due');
    expect((await planOf(org)).effectivePlan).toBe('crece');
    const audit = await admin.auditLog.findMany({
      where: { organizationId: org.orgId, action: 'organization.plan_payment_failed' },
    });
    expect(audit).toHaveLength(1);

    const retry = `ch${randomUUID().slice(0, 8)}`;
    fake.charges.set(retry, {
      ...fake.charges.get(rejected)!,
      id: retry,
      paymentStatus: 'approved',
    });
    await notify('subscription_authorized_payment', retry).expect(200);
    expect((await row(org.orgId))?.status).toBe('active');
  });

  it('subir de plan: la nueva suscripción rige y la anterior se cancela en Mercado Pago (sin doble cobro)', async () => {
    const org = await registerOrg('Refugio Sube');
    const crece = await checkoutAndAuthorize(org, 'crece');
    const pro = await checkoutAndAuthorize(org, 'pro');
    expect((await planOf(org)).effectivePlan).toBe('pro');
    expect(fake.cancelled).toContain(crece);
    expect(fake.cancelled).not.toContain(pro);
    // El aviso de cancelación de la suscripción vieja no toca la nueva.
    await notify('subscription_preapproval', crece).expect(200);
    expect(await row(org.orgId)).toMatchObject({
      plan: 'pro',
      status: 'active',
      providerReference: pro,
    });
  });

  it('cancelar: se detiene el cobro y el plan sigue hasta el fin de lo pagado', async () => {
    const org = await registerOrg('Refugio Cancela');
    const id = await checkoutAndAuthorize(org, 'pro');
    const res = await request(server).post('/org/plan/cancel').set(auth(org.token)).expect(200);
    expect(res.body.status).toBe('canceled');
    expect(fake.cancelled).toContain(id);
    const view = await planOf(org);
    expect(view.effectivePlan).toBe('pro');
    expect(view.graceEndsAt).toBe((await row(org.orgId))?.currentPeriodEnd?.toISOString());
    // El aviso de Mercado Pago de esa cancelación no lo deja en Gratis antes de tiempo.
    await notify('subscription_preapproval', id).expect(200);
    expect((await planOf(org)).effectivePlan).toBe('pro');
    // Sin plan activo no hay nada que cancelar.
    await request(server).post('/org/plan/cancel').set(auth(org.token)).expect(409);
  });

  it('si Mercado Pago no responde al cancelar, no se marca cancelado (no queda cobrando a escondidas)', async () => {
    const org = await registerOrg('Refugio Cancela Falla');
    await checkoutAndAuthorize(org, 'crece');
    fake.failCancel = true;
    await request(server).post('/org/plan/cancel').set(auth(org.token)).expect(503);
    expect((await row(org.orgId))?.status).toBe('active');
  });

  it('la plataforma asigna a mano: cancela el cobro de Mercado Pago y deja el plan como manual', async () => {
    const org = await registerOrg('Refugio Manual');
    const platform = await registerOrg('Plataforma Cobro');
    await admin.userRole.create({
      data: { organizationId: platform.orgId, userId: platform.userId, role: 'platform_admin' },
    });
    const id = await checkoutAndAuthorize(org, 'crece');
    await request(server)
      .put(`/platform/organizations/${org.orgId}/plan`)
      .set(auth(platform.token))
      .send({
        plan: 'pro',
        status: 'active',
        currentPeriodEnd: inDays(60).toISOString(),
        providerReference: 'FAC-001',
      })
      .expect(200);
    expect(fake.cancelled).toContain(id);
    expect(await row(org.orgId)).toMatchObject({
      plan: 'pro',
      provider: 'manual',
      providerReference: 'FAC-001',
    });
  });

  describe('avisos por correo', () => {
    const subscribe = (
      orgId: string,
      data: { plan: string; status: string; provider: string; end: Date },
    ) =>
      admin.organizationSubscription.upsert({
        where: { organizationId: orgId },
        create: {
          organizationId: orgId,
          plan: data.plan,
          status: data.status,
          provider: data.provider,
          currentPeriodEnd: data.end,
        },
        update: {
          plan: data.plan,
          status: data.status,
          provider: data.provider,
          currentPeriodEnd: data.end,
        },
      });

    it('avisa al dueño: plan manual por vencer, cobro fallido y fin de un plan cancelado; nunca a quien renueva solo', async () => {
      const [manual, failed, ending, renewing] = actors.slice(0, 4);
      await subscribe(manual.orgId, {
        plan: 'crece',
        status: 'active',
        provider: 'manual',
        end: inDays(3),
      });
      await subscribe(failed.orgId, {
        plan: 'crece',
        status: 'past_due',
        provider: 'mercadopago',
        end: inDays(-2),
      });
      await subscribe(ending.orgId, {
        plan: 'pro',
        status: 'canceled',
        provider: 'mercadopago',
        end: inDays(5),
      });
      await subscribe(renewing.orgId, {
        plan: 'pro',
        status: 'active',
        provider: 'mercadopago',
        end: inDays(3),
      });

      const send = jest.spyOn(notifications, 'send');
      await reminders.sendDueReminders();
      const to = (email: string) => send.mock.calls.filter(([m]) => m.to === email).map(([m]) => m);

      expect(to(manual.email)).toHaveLength(1);
      expect(to(manual.email)[0].subject).toMatch(/vence/);
      expect(to(manual.email)[0].idempotencyKey).toContain(
        `plan.reminder:${manual.orgId}:renewal_due`,
      );
      expect(to(failed.email)[0].subject).toMatch(/No pudimos cobrar/);
      expect(to(ending.email)[0].subject).toMatch(/termina/);
      expect(to(renewing.email)).toHaveLength(0);
    });

    it('con los planes apagados no se envía ningún aviso', async () => {
      setEnforced(false);
      const send = jest.spyOn(notifications, 'send');
      expect(await reminders.sendDueReminders()).toBe(0);
      expect(send).not.toHaveBeenCalled();
    });
  });
});
