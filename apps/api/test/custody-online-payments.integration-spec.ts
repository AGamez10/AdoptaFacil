import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { mercadoPagoSignatureV1 } from '../src/core/payments/mercadopago-payment.adapter';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization, formalizeTestOrganization } from './support/organization-status';

/**
 * Pago en línea de un cobro de guardería o custodia, de extremo a extremo con
 * PAYMENT_DRIVER=mercadopago y CERO red (cada llamada a Mercado Pago es un
 * fetch simulado):
 *   - apagado por defecto; encender exige la aceptación expresa, rol de
 *     administración y la cuenta de Mercado Pago de la organización conectada;
 *   - el enlace de pago es por cobro, no revela datos del responsable y otra
 *     organización no puede pedirlo;
 *   - la orden se crea con el token de la ORGANIZACIÓN, nunca con el de la
 *     plataforma (el de planes y café);
 *   - el aviso firmado se relee con el token de la organización: firma falsa
 *     403, otra cuenta 403, valor distinto nunca paga; el válido paga UNA vez
 *     y emite la constancia; pago parcial y luego el resto;
 *   - una devolución anula el pago y el cobro vuelve a su saldo;
 *   - un pago que el cobro ya no admite queda para revisión, sin inventar un
 *     pago;
 *   - no es una donación: no crea donaciones ni entra a su conciliación;
 *   - REGLA: nada de esto toca la custodia del animal.
 */
describe('Custody online payments (Mercado Pago, cuenta de la organización)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const savedEnv = { ...process.env };
  const realFetch = globalThis.fetch;

  const ORDERS_SECRET = 'mp-orders-webhook-secret-custody';
  const PLATFORM_TOKEN = 'APP_USR-platform-token-custody';
  const mpUserId = `8${String(Date.now()).slice(-9)}`;
  const orgAccess = 'APP_USR-org-access-custody';

  interface Actor {
    token: string;
    userId: string;
    orgId: string;
  }
  let orgA: Actor;
  let orgB: Actor;
  let animalId: string;
  let responsibleId: string;
  let chargeId: string;
  let linkToken: string;

  let tokenResponse: Record<string, unknown> = {};
  const orderCalls: { auth: string; body: Record<string, unknown> }[] = [];
  const orders = new Map<string, { token: string; body: Record<string, unknown> }>();

  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

  const as = (actor: Actor) => ({
    get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${actor.token}`),
    post: (path: string, body?: object) =>
      request(server)
        .post(path)
        .set('Authorization', `Bearer ${actor.token}`)
        .send(body ?? {}),
    put: (path: string, body: object) =>
      request(server).put(path).set('Authorization', `Bearer ${actor.token}`).send(body),
    delete: (path: string) =>
      request(server).delete(path).set('Authorization', `Bearer ${actor.token}`),
  });

  beforeAll(async () => {
    process.env.PAYMENT_DRIVER = 'mercadopago';
    process.env.MERCADOPAGO_BASE_URL = 'https://api.mp.test';
    process.env.MERCADOPAGO_CLIENT_ID = '5550002';
    process.env.MERCADOPAGO_CLIENT_SECRET = 'mp-client-secret-custody';
    process.env.MERCADOPAGO_WEBHOOK_SECRET = 'mp-webhook-secret-custody';
    process.env.MERCADOPAGO_ORDERS_WEBHOOK_SECRET = ORDERS_SECRET;
    process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN = PLATFORM_TOKEN;
    process.env.API_PUBLIC_BASE_URL = 'https://api.adoptafacil.test';
    process.env.MERCADOPAGO_TEST = 'false';
    globalThis.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization);
      if (u === 'https://api.mp.test/oauth/token') return json(tokenResponse);
      if (u === 'https://api.mp.test/v1/orders' && init?.method === 'POST') {
        orderCalls.push({ auth, body: JSON.parse(String(init?.body)) });
        return json({
          id: `ORDCUS${orderCalls.length}`,
          checkout_url: `https://www.mercadopago.com.co/checkout/v1/redirect?order_id=ORDCUS${orderCalls.length}`,
        });
      }
      const ord = /^https:\/\/api\.mp\.test\/v1\/orders\/(\w+)$/.exec(u);
      if (ord) {
        const found = orders.get(ord[1]);
        return found && auth === `Bearer ${found.token}`
          ? json({ live_mode: true, ...found.body })
          : json({}, 404);
      }
      return realFetch(url, init);
    }) as typeof fetch;

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const register = async (name: string): Promise<Actor> => {
      const res = await request(server)
        .post('/auth/register/organization')
        .send({
          ...LEGAL_ORG,
          organizationName: name,
          displayName: `Owner ${name}`,
          email: `custody-mp-${randomUUID()}@test.local`,
          password: 'password-1234',
        })
        .expect(201);
      orgIds.push(res.body.user.organizationId);
      await approveTestOrganization(admin, res.body.user.organizationId);
      await formalizeTestOrganization(admin, res.body.user.organizationId);
      return {
        token: res.body.tokens.accessToken,
        userId: res.body.user.id,
        orgId: res.body.user.organizationId,
      };
    };
    orgA = await register('Fundación Guardería MP');
    orgB = await register('Refugio Vecino MP');

    const animal = await as(orgA)
      .post('/animals', {
        name: 'Canela',
        species: 'dog',
        sex: 'female',
        size: 'medium',
        approximateAgeMonths: 30,
      })
      .expect(201);
    animalId = animal.body.id;
    const responsible = await as(orgA)
      .post('/custody/responsibles', {
        fullName: 'Persona Responsable Reservada',
        documentType: 'CC',
        documentNumber: '1000200399',
        phone: '3000000000',
      })
      .expect(201);
    responsibleId = responsible.body.id;
    chargeId = await newCharge(350000);
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    process.env = savedEnv;
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  async function newCharge(amountCop: number): Promise<string> {
    const res = await as(orgA)
      .post('/custody/charges', {
        animalId,
        responsibleId,
        concept: 'boarding_fee',
        description: 'Mensualidad de guardería',
        amountCop,
        dueDate: today,
      })
      .expect(201);
    return res.body.id as string;
  }

  /** La organización conecta SU cuenta de Mercado Pago por OAuth. */
  async function connectMercadoPago(actor: Actor) {
    const res = await as(actor).get('/org/mercadopago/connect').expect(200);
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = (setCookie.find((c) => c.startsWith('af_mp_oauth=')) as string).split(';')[0];
    const state = new URL(res.body.authorizeUrl).searchParams.get('state');
    tokenResponse = {
      access_token: orgAccess,
      refresh_token: 'TG-org-refresh-custody',
      expires_in: 15_552_000,
      user_id: Number(mpUserId),
      public_key: 'APP_USR-public',
      live_mode: true,
    };
    await request(server)
      .get(`/org/mercadopago/callback?code=TG-code-custody&state=${state}`)
      .set('Cookie', cookie)
      .expect(302);
  }

  const notifyOrder = (orderId: string, reference: string, secret = ORDERS_SECRET) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = randomUUID();
    const v1 = mercadoPagoSignatureV1(secret, orderId, requestId, ts);
    return request(server)
      .post(`/donations/webhook/mercadopago?data.id=${orderId}&type=order`)
      .set('x-signature', `ts=${ts},v1=${v1}`)
      .set('x-request-id', requestId)
      .send({
        type: 'order',
        action: 'order.processed',
        data: { id: orderId, external_reference: reference },
      });
  };

  const order = (id: string, reference: string, amount: number, over: object = {}) => ({
    id,
    status: 'processed',
    status_detail: 'accredited',
    external_reference: reference,
    total_amount: amount.toFixed(2),
    total_paid_amount: amount.toFixed(2),
    transactions: {
      payments: [
        {
          id: `PAY-${id}`,
          amount: amount.toFixed(2),
          status: 'processed',
          payment_method: { id: 'pse', type: 'bank_transfer' },
        },
      ],
    },
    ...over,
  });

  const checkout = (token: string, amountCop?: number) =>
    request(server)
      .post(`/public/custody/pay/${token}/checkout`)
      .send(amountCop === undefined ? {} : { amountCop });

  const chargeOf = async (id: string) =>
    (await as(orgA).get('/custody/charges').expect(200)).body.find(
      (c: { id: string }) => c.id === id,
    );

  it('is OFF by default and no link exists until the organization turns it on', async () => {
    const settings = await as(orgA).get('/custody/online-payments/settings').expect(200);
    expect(settings.body).toMatchObject({ enabled: false, canCollect: false });
    const res = await as(orgA).post(`/custody/charges/${chargeId}/payment-link`).expect(409);
    expect(res.body.message).toMatch(/apagado/);
  });

  it('turning it on needs the express acceptance and the organization account connected', async () => {
    await as(orgA).put('/custody/online-payments/settings', { enabled: true }).expect(400);
    // Aceptó, pero la organización no ha conectado SU cuenta: no hay con qué cobrar.
    const noAccount = await as(orgA)
      .put('/custody/online-payments/settings', { enabled: true, acceptResponsibility: true })
      .expect(409);
    expect(noAccount.body.message).toMatch(/Mercado Pago/);
    await request(server)
      .put('/custody/online-payments/settings')
      .send({ enabled: true, acceptResponsibility: true })
      .expect(401);

    await connectMercadoPago(orgA);
    const on = await as(orgA)
      .put('/custody/online-payments/settings', { enabled: true, acceptResponsibility: true })
      .expect(200);
    expect(on.body).toMatchObject({ enabled: true, canCollect: true });
    expect(on.body.acceptedByName).toMatch(/Owner/);
    expect(on.body.acceptedAt).toBeTruthy();

    const row = await admin.custodyOnlinePaymentSettings.findUnique({
      where: { organizationId: orgA.orgId },
    });
    expect(row).toMatchObject({ enabled: true, acceptedByUserId: orgA.userId });
    expect(row?.termsVersion).toBeTruthy();
    const audit = await admin.auditLog.findFirst({
      where: { organizationId: orgA.orgId, action: 'custody.online_payments_enabled' },
    });
    expect(audit?.actorUserId).toBe(orgA.userId);
    // La otra organización sigue apagada.
    const other = await as(orgB).get('/custody/online-payments/settings').expect(200);
    expect(other.body).toMatchObject({ enabled: false, canCollect: false });
  });

  it('gives one link per charge, hides the responsible and is closed to other organizations', async () => {
    const first = await as(orgA).post(`/custody/charges/${chargeId}/payment-link`).expect(200);
    const again = await as(orgA).post(`/custody/charges/${chargeId}/payment-link`).expect(200);
    expect(again.body.url).toBe(first.body.url);
    linkToken = (first.body.url as string).split('/').pop() as string;
    expect(linkToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.body.url).toContain('/pagar/guarderia/');

    // Otra organización: con el suyo apagado ni se mira el cobro; encendido, no lo encuentra.
    await as(orgB).post(`/custody/charges/${chargeId}/payment-link`).expect(409);
    await admin.custodyOnlinePaymentSettings.create({
      data: {
        organizationId: orgB.orgId,
        enabled: true,
        termsVersion: 'test',
        acceptedAt: new Date(),
        acceptedByUserId: orgB.userId,
        acceptedByName: 'Owner',
      },
    });
    await as(orgB).post(`/custody/charges/${chargeId}/payment-link`).expect(404);
    await request(server).post(`/custody/charges/${chargeId}/payment-link`).expect(401);

    const pub = await request(server).get(`/public/custody/pay/${linkToken}`).expect(200);
    expect(pub.body).toMatchObject({
      organizationName: 'Fundación Guardería MP',
      animalName: 'Canela',
      amountCop: 350000,
      balanceCop: 350000,
      state: 'open',
    });
    expect(pub.body.notice).toMatch(/no es una factura/);
    expect(JSON.stringify(pub.body)).not.toMatch(/Reservada|1000200399|3000000000/);

    await request(server)
      .get(`/public/custody/pay/${'z'.repeat(43)}`)
      .expect(404);
    await request(server).get('/public/custody/pay/no-es-un-enlace').expect(404);
  });

  it("opens the checkout with the ORGANIZATION's token, never the platform's", async () => {
    await checkout(linkToken, 1000).expect(400); // bajo el mínimo
    await checkout(linkToken, 350001).expect(400); // sobre el saldo
    await checkout(linkToken, 100.5).expect(400);
    expect(orderCalls).toHaveLength(0);

    const res = await checkout(linkToken, 100000).expect(200);
    expect(res.body.checkoutUrl).toContain('mercadopago.com.co');
    expect(res.body.reference).toMatch(/^af-/);
    expect(orderCalls).toHaveLength(1);
    expect(orderCalls[0].auth).toBe(`Bearer ${orgAccess}`);
    expect(orderCalls[0].auth).not.toContain(PLATFORM_TOKEN);
    expect(orderCalls[0].body).toMatchObject({
      total_amount: '100000',
      external_reference: res.body.reference,
      items: [{ title: 'Guardería y custodia', unit_price: '100000', quantity: 1 }],
    });
    expect(JSON.stringify(orderCalls[0].body)).toContain('/pagar/guarderia/resultado');

    const status = await request(server)
      .get(`/public/custody/pay/status/${res.body.reference}`)
      .expect(200);
    expect(status.body).toMatchObject({ status: 'pending', amountCop: 100000 });
    await request(server).get('/public/custody/pay/status/af-desconocida').expect(404);
  });

  it('settles only a verified notification, once, with the receipt; partial then the rest', async () => {
    const ref = (await checkout(linkToken, 100000).expect(200)).body.reference as string;

    // Firma falsa.
    orders.set('ORDC1', { token: orgAccess, body: order('ORDC1', ref, 100000) });
    await notifyOrder('ORDC1', ref, 'otro-secreto').expect(403);
    // Orden que el token de la organización no puede leer (otra cuenta).
    orders.set('ORDC2', { token: 'APP_USR-otra-cuenta', body: order('ORDC2', ref, 100000) });
    await notifyOrder('ORDC2', ref).expect(403);
    // Valor distinto al que se cobró: nunca paga y queda auditado.
    orders.set('ORDC3', { token: orgAccess, body: order('ORDC3', ref, 1000) });
    expect((await notifyOrder('ORDC3', ref).expect(200)).body.applied).toBe(false);
    expect(
      await admin.auditLog.count({
        where: { organizationId: orgA.orgId, action: 'custody.online_payment_mismatch' },
      }),
    ).toBe(1);
    expect((await chargeOf(chargeId)).paidCop).toBe(0);

    const ok = await notifyOrder('ORDC1', ref).expect(200);
    expect(ok.body).toEqual({ applied: true, status: null, donationId: null });
    const again = await notifyOrder('ORDC1', ref).expect(200);
    expect(again.body.applied).toBe(false);

    const charge = await chargeOf(chargeId);
    expect(charge).toMatchObject({ status: 'pending', paidCop: 100000, balanceCop: 250000 });
    expect(charge.payments).toHaveLength(1);
    expect(charge.payments[0]).toMatchObject({
      amountCop: 100000,
      method: 'mercadopago',
      reference: 'PAY-ORDC1',
      receivedByName: 'Pago en línea (Mercado Pago)',
    });
    expect(charge.payments[0].receiptNumber).toMatch(/^RP-\d{4}-\d{6}$/);
    expect(charge.payments[0].receiptDocumentId).toBeTruthy();
    const audit = await admin.auditLog.findFirst({
      where: { organizationId: orgA.orgId, action: 'custody.online_payment_received' },
    });
    expect(audit?.actorUserId).toBeNull();

    const status = await request(server).get(`/public/custody/pay/status/${ref}`).expect(200);
    expect(status.body).toMatchObject({
      status: 'approved',
      receiptNumber: charge.payments[0].receiptNumber,
    });

    // No es una donación: ni donaciones ni filas de su conciliación.
    expect(await admin.donation.count({ where: { organizationId: orgA.orgId } })).toBe(0);
    expect(await admin.mercadoPagoPayment.count({ where: { organizationId: orgA.orgId } })).toBe(0);

    // El resto: sin valor se cobra todo el saldo.
    const rest = await checkout(linkToken).expect(200);
    expect(orderCalls.at(-1)?.body.total_amount).toBe('250000');
    orders.set('ORDC4', { token: orgAccess, body: order('ORDC4', rest.body.reference, 250000) });
    expect((await notifyOrder('ORDC4', rest.body.reference).expect(200)).body.applied).toBe(true);
    expect(await chargeOf(chargeId)).toMatchObject({ status: 'paid', balanceCop: 0 });

    const pub = await request(server).get(`/public/custody/pay/${linkToken}`).expect(200);
    expect(pub.body.state).toBe('paid');
    await checkout(linkToken).expect(409);
    await as(orgA).post(`/custody/charges/${chargeId}/payment-link`).expect(409);
  });

  it('a refund reported by Mercado Pago voids the payment and the charge owes again', async () => {
    const attempt = await admin.custodyOnlinePayment.findFirstOrThrow({
      where: { organizationId: orgA.orgId, gatewayPaymentId: 'PAY-ORDC4' },
    });
    orders.set('ORDC4', {
      token: orgAccess,
      body: order('ORDC4', attempt.collectionId, 250000, { status: 'refunded' }),
    });
    expect((await notifyOrder('ORDC4', attempt.collectionId).expect(200)).body.applied).toBe(true);
    expect((await notifyOrder('ORDC4', attempt.collectionId).expect(200)).body.applied).toBe(false);

    const charge = await chargeOf(chargeId);
    expect(charge).toMatchObject({ status: 'pending', paidCop: 100000, balanceCop: 250000 });
    const voided = charge.payments.find((p: { voidedAt?: string }) => p.voidedAt);
    expect(voided.voidReason).toMatch(/devolución/);
    expect(
      await admin.custodyOnlinePayment.findUnique({ where: { id: attempt.id } }),
    ).toMatchObject({ status: 'reversed', reversalKind: 'refund' });
    const status = await request(server)
      .get(`/public/custody/pay/status/${attempt.collectionId}`)
      .expect(200);
    expect(status.body.status).toBe('reversed');
  });

  it('a payment the charge no longer admits is flagged for review, never invented', async () => {
    const other = await newCharge(60000);
    const url = (await as(orgA).post(`/custody/charges/${other}/payment-link`).expect(200)).body
      .url as string;
    const token = url.split('/').pop() as string;
    // Dos personas abren el pago por todo el saldo y las dos pagan.
    const a = (await checkout(token).expect(200)).body.reference as string;
    const b = (await checkout(token).expect(200)).body.reference as string;
    orders.set('ORDC5', { token: orgAccess, body: order('ORDC5', a, 60000) });
    orders.set('ORDC6', { token: orgAccess, body: order('ORDC6', b, 60000) });
    expect((await notifyOrder('ORDC5', a).expect(200)).body.applied).toBe(true);
    expect((await notifyOrder('ORDC6', b).expect(200)).body.applied).toBe(true);

    const charge = await chargeOf(other);
    expect(charge).toMatchObject({ status: 'paid', paidCop: 60000, balanceCop: 0 });
    expect(charge.payments).toHaveLength(1);
    expect(
      await admin.custodyOnlinePayment.findUnique({ where: { collectionId: b } }),
    ).toMatchObject({ status: 'mismatch', paymentId: null, gatewayPaymentId: 'PAY-ORDC6' });
    const review = await admin.custodyEvent.findFirst({
      where: { organizationId: orgA.orgId, type: 'online_payment_review' },
    });
    expect(review?.detail).toMatch(/devuelve el excedente/);
    const status = await request(server).get(`/public/custody/pay/status/${b}`).expect(200);
    expect(status.body.status).toBe('review');
  });

  it('never touches the custody of the animal', async () => {
    const overview = await as(orgA).get(`/custody/animals/${animalId}/overview`).expect(200);
    expect(overview.body.custodyStatus).toBe('not_registered');
    expect(await admin.custodyRelease.count({ where: { organizationId: orgA.orgId } })).toBe(0);
    expect((await admin.animal.findUnique({ where: { id: animalId } }))?.status).toBe(
      (await as(orgA).get(`/animals/${animalId}`).expect(200)).body.status,
    );
  });

  it('a revoked link stops working; turning it off closes every link', async () => {
    const pending = await newCharge(40000);
    const url = (await as(orgA).post(`/custody/charges/${pending}/payment-link`).expect(200)).body
      .url as string;
    const token = url.split('/').pop() as string;

    await as(orgA).put('/custody/online-payments/settings', { enabled: false }).expect(200);
    const off = await request(server).get(`/public/custody/pay/${token}`).expect(200);
    expect(off.body.state).toBe('unavailable');
    const before = orderCalls.length;
    await checkout(token).expect(409);
    expect(orderCalls).toHaveLength(before);
    // La aceptación anterior no se borra al apagar.
    const row = await admin.custodyOnlinePaymentSettings.findUnique({
      where: { organizationId: orgA.orgId },
    });
    expect(row).toMatchObject({ enabled: false, acceptedByUserId: orgA.userId });

    await as(orgA)
      .put('/custody/online-payments/settings', { enabled: true, acceptResponsibility: true })
      .expect(200);
    await as(orgB).delete(`/custody/charges/${pending}/payment-link`).expect(204);
    await request(server).get(`/public/custody/pay/${token}`).expect(200);
    await as(orgA).delete(`/custody/charges/${pending}/payment-link`).expect(204);
    await request(server).get(`/public/custody/pay/${token}`).expect(404);
    await checkout(token).expect(404);
    // Un enlace nuevo es distinto del revocado.
    const fresh = await as(orgA).post(`/custody/charges/${pending}/payment-link`).expect(200);
    expect(fresh.body.url).not.toBe(url);
  });

  it('a person cannot register a payment by hand as "mercadopago"', async () => {
    const pending = await newCharge(30000);
    await as(orgA)
      .post(`/custody/charges/${pending}/payments`, {
        amountCop: 30000,
        paidOn: today,
        method: 'mercadopago',
      })
      .expect(400);
  });
});
