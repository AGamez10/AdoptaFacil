import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { computeBreakdown, planSubscriptionReference } from '@adoptafacil/contracts';
import { mercadoPagoSignatureV1 } from '../src/core/payments/mercadopago-payment.adapter';
import { addOneMonth, planMonthlyAmount } from '../src/core/plans/plan-billing.service';
import { PlansService } from '../src/core/plans/plans.service';
import { MercadoPagoConnectionsService } from '../src/modules/payments/mercadopago-connections.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_GUEST, LEGAL_ORG } from './support/legal';
import { approveTestOrganization, formalizeTestOrganization } from './support/organization-status';

/**
 * Mercado Pago end to end (ADR-PAG-003) with PAYMENT_DRIVER=mercadopago and
 * ZERO network (every Mercado Pago call is a mocked global fetch):
 *   - the Owner connects the org's OWN account by OAuth (sealed state,
 *     tokens encrypted at rest, never echoed, audited without tokens);
 *   - one Mercado Pago account cannot back two organizations;
 *   - a guest donation is a Checkout Pro ORDER (`POST /v1/orders`) created
 *     with the ORG's token (no platform fee, no platform token);
 *   - the signed notification is read back with the org's token: forged
 *     signature 403, another collector 403, amount mismatch never approves,
 *     valid approves once, a refund is audited; an Orders notification (one
 *     URL per application) finds the organization by `external_reference`
 *     and settles only what the org's own token can read back;
 *   - a grant Mercado Pago no longer honors blocks donations until reconnected;
 *   - AdoptaFácil's plan is charged with the PLATFORM account (subscription).
 */
describe('Donations with Mercado Pago (OAuth of the organization, no split)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const savedEnv = { ...process.env };
  const realFetch = globalThis.fetch;

  const SECRET = 'mp-webhook-secret-integration';
  /** The Checkout Pro (Orders) application has its own webhook secret. */
  const ORDERS_SECRET = 'mp-orders-webhook-secret-integration';
  const PLATFORM_TOKEN = 'APP_USR-platform-token-integration';
  const mpUserId = `7${String(Date.now()).slice(-9)}`;
  const orgAccess = 'APP_USR-org-access-integration';
  const orgRefresh = 'TG-org-refresh-integration';

  let orgId = '';
  let orgToken = '';
  let otherOrgToken = '';
  /** What the mocked token endpoint answers next. */
  let tokenResponse: { status: number; body: Record<string, unknown> } = {
    status: 200,
    body: {},
  };
  const tokenRequests: URLSearchParams[] = [];
  const preferenceCalls: { auth: string; body: Record<string, unknown> }[] = [];
  /** Payments the mocked API knows, by id, with the token allowed to read them. */
  const payments = new Map<string, { token: string; body: Record<string, unknown> }>();
  /** Orders the mocked API knows, by id, with the token allowed to read them. */
  const orders = new Map<string, { token: string; body: Record<string, unknown> }>();
  const preapprovals = new Map<string, Record<string, unknown>>();
  const authorizedPayments = new Map<string, Record<string, unknown>>();

  beforeAll(async () => {
    process.env.PAYMENT_DRIVER = 'mercadopago';
    process.env.MERCADOPAGO_BASE_URL = 'https://api.mp.test';
    process.env.MERCADOPAGO_CLIENT_ID = '5550001';
    process.env.MERCADOPAGO_CLIENT_SECRET = 'mp-client-secret-integration';
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
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
      if (u === 'https://api.mp.test/oauth/token') {
        tokenRequests.push(new URLSearchParams(String(init?.body)));
        return json(tokenResponse.body, tokenResponse.status);
      }
      if (u === 'https://api.mp.test/v1/orders' && init?.method === 'POST') {
        const body = JSON.parse(String(init?.body));
        preferenceCalls.push({ auth, body });
        return json({
          id: `ORDTEST${preferenceCalls.length}`,
          checkout_url: `https://www.mercadopago.com.co/checkout/v1/redirect?order_id=ORDTEST${preferenceCalls.length}`,
        });
      }
      const ord = /^https:\/\/api\.mp\.test\/v1\/orders\/(\w+)$/.exec(u);
      if (ord) {
        const found = orders.get(ord[1]);
        // Same scoping as payments: another token ⇒ 404.
        return found && auth === `Bearer ${found.token}`
          ? json({ live_mode: true, ...found.body })
          : json({}, 404);
      }
      const pay = /^https:\/\/api\.mp\.test\/v1\/payments\/(\w+)$/.exec(u);
      if (pay) {
        const found = payments.get(pay[1]);
        // Mercado Pago scopes reads to the token owner: another token ⇒ 404.
        // Production deployment (MERCADOPAGO_TEST=false): real payments carry
        // live_mode=true unless a test sets it explicitly.
        return found && auth === `Bearer ${found.token}`
          ? json({ live_mode: true, ...found.body })
          : json({}, 404);
      }
      if (u === 'https://api.mp.test/preapproval' && init?.method === 'POST') {
        if (auth !== `Bearer ${PLATFORM_TOKEN}`) return json({}, 401);
        const body = JSON.parse(String(init?.body));
        const id = `preap-${preapprovals.size + 1}`;
        preapprovals.set(id, { id, status: 'pending', ...body });
        return json({
          id,
          init_point: `https://www.mercadopago.com.co/subscriptions/checkout?preapproval_id=${id}`,
        });
      }
      const preap = /^https:\/\/api\.mp\.test\/preapproval\/([\w-]+)$/.exec(u);
      if (preap) {
        const found = preapprovals.get(preap[1]);
        return found && auth === `Bearer ${PLATFORM_TOKEN}` ? json(found) : json({}, 404);
      }
      const charge = /^https:\/\/api\.mp\.test\/authorized_payments\/([\w-]+)$/.exec(u);
      if (charge) {
        const found = authorizedPayments.get(charge[1]);
        return found && auth === `Bearer ${PLATFORM_TOKEN}` ? json(found) : json({}, 404);
      }
      return realFetch(url, init);
    }) as typeof fetch;

    // ConfigModule validates process.env when AppModule is first imported,
    // so the module is loaded only AFTER the Mercado Pago env is set.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const register = async (name: string) => {
      const reg = await request(server)
        .post('/auth/register/organization')
        .send({
          ...LEGAL_ORG,
          organizationName: name,
          displayName: `Owner ${name}`,
          email: `mp-org-${randomUUID()}@test.local`,
          password: 'password-1234',
        })
        .expect(201);
      orgIds.push(reg.body.user.organizationId);
      await approveTestOrganization(admin, reg.body.user.organizationId);
      await formalizeTestOrganization(admin, reg.body.user.organizationId);
      return reg.body;
    };
    const a = await register('Refugio Mercado Pago');
    orgId = a.user.organizationId;
    orgToken = a.tokens.accessToken;
    const b = await register('Otro Refugio');
    otherOrgToken = b.tokens.accessToken;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    process.env = savedEnv;
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  const donate = (idempotencyKey: string) =>
    request(server)
      .post('/donations')
      .send({
        ...LEGAL_GUEST,
        organizationId: orgId,
        intendedAmount: 50000,
        idempotencyKey,
        payer: { email: 'donante@test.local' },
      });

  const availability = async () =>
    (await request(server).get(`/public/donations/organizations/${orgId}/availability`).expect(200))
      .body.canReceiveDonations;

  /** The authorize URL plus the browser-binding cookie `/connect` sets. */
  const connectUrl = async (token: string) => {
    const res = await request(server)
      .get('/org/mercadopago/connect')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = setCookie.find((c) => c.startsWith('af_mp_oauth='));
    expect(cookie).toMatch(/HttpOnly/i);
    return Object.assign(new URL(res.body.authorizeUrl), {
      cookie: (cookie as string).split(';')[0],
    });
  };

  const grant = (over: Record<string, unknown> = {}) => ({
    access_token: orgAccess,
    refresh_token: orgRefresh,
    expires_in: 15_552_000,
    user_id: Number(mpUserId),
    public_key: 'APP_USR-public',
    live_mode: true,
    ...over,
  });

  const notify = (paymentId: string, opts: { secret?: string; type?: string } = {}) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = randomUUID();
    const v1 = mercadoPagoSignatureV1(opts.secret ?? SECRET, paymentId, requestId, ts);
    return request(server)
      .post(
        `/donations/webhook/mercadopago/${orgId}?data.id=${paymentId}&type=${opts.type ?? 'payment'}`,
      )
      .set('x-signature', `ts=${ts},v1=${v1}`)
      .set('x-request-id', requestId)
      .send({ type: opts.type ?? 'payment', data: { id: paymentId } });
  };

  /** Orders notification: ONE URL for the application, no organization in it. */
  const notifyOrder = (orderId: string, opts: { secret?: string; reference?: string } = {}) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = randomUUID();
    const v1 = mercadoPagoSignatureV1(opts.secret ?? ORDERS_SECRET, orderId, requestId, ts);
    return request(server)
      .post(`/donations/webhook/mercadopago?data.id=${orderId}&type=order`)
      .set('x-signature', `ts=${ts},v1=${v1}`)
      .set('x-request-id', requestId)
      .send({
        type: 'order',
        action: 'order.processed',
        data: { id: orderId, external_reference: opts.reference },
      });
  };

  it('refuses a donation before the org connects Mercado Pago (409, no platform fallback)', async () => {
    expect(await availability()).toBe(false);
    await donate(`mp-${randomUUID()}`).expect(409);
  });

  it('connect is Owner/Administrator only and needs a session', async () => {
    await request(server).get('/org/mercadopago/connect').expect(401);
    await request(server).get('/org/mercadopago/status').expect(401);
  });

  it('a tampered or missing state never connects anything', async () => {
    const url = await connectUrl(orgToken);
    const state = url.searchParams.get('state') as string;
    const tampered = state.slice(0, -2) + (state.endsWith('AA') ? 'BB' : 'AA');
    const res = await request(server)
      .get(`/org/mercadopago/callback?code=TG-code&state=${tampered}`)
      .set('Cookie', url.cookie)
      .expect(302);
    expect(res.headers.location).toMatch(/mercadopago=expired$/);
    await request(server).get('/org/mercadopago/callback?code=TG-code').expect(302);
    expect(tokenRequests).toHaveLength(0);
  });

  it('a leaked authorize URL is useless in another browser, and a state works only once', async () => {
    const url = await connectUrl(orgToken);
    const state = url.searchParams.get('state') as string;
    // Another browser: no binding cookie, or someone else's.
    const other = await connectUrl(orgToken);
    for (const cookie of [undefined, other.cookie]) {
      const req = request(server).get(`/org/mercadopago/callback?code=TG-code&state=${state}`);
      const res = await (cookie ? req.set('Cookie', cookie) : req).expect(302);
      expect(res.headers.location).toMatch(/mercadopago=expired$/);
    }
    expect(tokenRequests).toHaveLength(0);
    // The right browser, used twice: only the first callback is honored.
    const first = await request(server)
      .get(`/org/mercadopago/callback?error=access_denied&state=${state}`)
      .set('Cookie', url.cookie)
      .expect(302);
    expect(first.headers.location).toMatch(/mercadopago=denied$/);
    expect(first.headers['set-cookie']?.toString()).toMatch(/af_mp_oauth=;/);
    const replay = await request(server)
      .get(`/org/mercadopago/callback?code=TG-code&state=${state}`)
      .set('Cookie', url.cookie)
      .expect(302);
    expect(replay.headers.location).toMatch(/mercadopago=expired$/);
    expect(tokenRequests).toHaveLength(0);
  });

  it('the org declining on Mercado Pago is reported as denied', async () => {
    const url = await connectUrl(orgToken);
    const res = await request(server)
      .get(`/org/mercadopago/callback?error=access_denied&state=${url.searchParams.get('state')}`)
      .set('Cookie', url.cookie)
      .expect(302);
    expect(res.headers.location).toMatch(/mercadopago=denied$/);
  });

  it('a sandbox test-user grant is refused when MERCADOPAGO_TEST is off (never stored)', async () => {
    const url = await connectUrl(orgToken);
    tokenResponse = { status: 200, body: grant({ live_mode: false }) };
    const res = await request(server)
      .get(`/org/mercadopago/callback?code=TG-code-test&state=${url.searchParams.get('state')}`)
      .set('Cookie', url.cookie)
      .expect(302);
    expect(res.headers.location).toMatch(/mercadopago=error$/);
    const stored = await admin.organizationMercadoPagoConnection.findUnique({
      where: { organizationId: orgId },
    });
    expect(stored).toBeNull();
    expect(await availability()).toBe(false);
  });

  it('Owner connects by OAuth: tokens encrypted at rest, never echoed nor audited', async () => {
    const url = await connectUrl(orgToken);
    expect(url.origin).toBe('https://auth.mercadopago.com.co');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.adoptafacil.test/org/mercadopago/callback',
    );
    tokenResponse = { status: 200, body: grant() };
    const res = await request(server)
      .get(`/org/mercadopago/callback?code=TG-code-1&state=${url.searchParams.get('state')}`)
      .set('Cookie', url.cookie)
      .expect(302);
    expect(res.headers.location).toBe(
      'http://localhost:5173/organizacion?tab=pagos&mercadopago=connected'.replace(
        'http://localhost:5173',
        (process.env.WEB_BASE_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
      ),
    );
    const sent = tokenRequests[tokenRequests.length - 1];
    expect(sent.get('grant_type')).toBe('authorization_code');
    expect(sent.get('code')).toBe('TG-code-1');

    const status = await request(server)
      .get('/org/mercadopago/status')
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    expect(status.body).toMatchObject({
      connected: true,
      status: 'active',
      mpUserId,
      liveMode: true,
    });
    expect(JSON.stringify(status.body)).not.toContain(orgAccess);

    const stored = await admin.organizationMercadoPagoConnection.findUnique({
      where: { organizationId: orgId },
    });
    expect(stored?.accessTokenEnc).not.toContain(orgAccess);
    expect(stored?.refreshTokenEnc).not.toContain(orgRefresh);
    const audits = await admin.auditLog.findMany({
      where: { organizationId: orgId, action: 'payment_gateway.mercadopago_connected' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain(orgAccess);
    expect(await availability()).toBe(true);
  });

  it('the same Mercado Pago account cannot be connected to a second organization', async () => {
    const url = await connectUrl(otherOrgToken);
    tokenResponse = { status: 200, body: grant() };
    const res = await request(server)
      .get(`/org/mercadopago/callback?code=TG-code-2&state=${url.searchParams.get('state')}`)
      .set('Cookie', url.cookie)
      .expect(302);
    expect(res.headers.location).toMatch(/mercadopago=already_linked$/);
  });

  let reference = '';
  let amountCharged = 0;
  let donationId = '';

  it("a guest donation is a Checkout Pro order created with the ORG's token, no platform fee", async () => {
    const res = await donate(`mp-${randomUUID()}`).expect(201);
    const expected = computeBreakdown(50000);
    expect(res.body.status).toBe('pending');
    expect(res.body.breakdown).toEqual(expected);
    expect(res.body.paymentLinkUrl).toMatch(/^https:\/\/www\.mercadopago\.com\.co\//);
    reference = res.body.collectionId;
    amountCharged = res.body.amountCharged;
    donationId = res.body.id;
    const call = preferenceCalls[preferenceCalls.length - 1];
    expect(call.auth).toBe(`Bearer ${orgAccess}`);
    expect(call.auth).not.toContain(PLATFORM_TOKEN);
    expect(call.body).toMatchObject({
      type: 'online',
      external_reference: reference,
      // COP sin decimales: la orden lleva el monto en pesos enteros.
      total_amount: String(expected.amountCharged),
      config: {
        online: {
          success_url: expect.stringContaining(`/donaciones/resultado?reference=${reference}`),
        },
      },
    });
    // Orders has no per-order notification URL: it is set on the application.
    expect(call.body.notification_url).toBeUndefined();
    expect((call.body.items as Record<string, unknown>[])[0].unit_price).toBe(
      String(expected.amountCharged),
    );
  });

  it('a notification with a FORGED signature is 403', async () => {
    payments.set('900001', {
      token: orgAccess,
      body: {
        id: 900001,
        status: 'approved',
        collector_id: Number(mpUserId),
        external_reference: reference,
        transaction_amount: amountCharged,
        currency_id: 'COP',
      },
    });
    await notify('900001', { secret: 'not-the-secret' }).expect(403);
  });

  it('a payment that is not readable with the org token (another account) is 403', async () => {
    payments.set('900002', {
      token: 'APP_USR-someone-else',
      body: { id: 900002, status: 'approved', collector_id: 1, external_reference: reference },
    });
    await notify('900002').expect(403);
  });

  it('a sandbox payment (live_mode=false) never settles a real donation (403)', async () => {
    payments.set('900004', {
      token: orgAccess,
      body: {
        id: 900004,
        status: 'approved',
        live_mode: false,
        collector_id: Number(mpUserId),
        external_reference: reference,
        transaction_amount: amountCharged,
        currency_id: 'COP',
      },
    });
    await notify('900004').expect(403);
  });

  it('non-payment notifications are acknowledged without effect', async () => {
    const res = await notify('900001', { type: 'merchant_order' }).expect(200);
    expect(res.body.applied).toBe(false);
  });

  it('a read-back amount mismatch never approves (audited)', async () => {
    payments.set('900003', {
      token: orgAccess,
      body: {
        id: 900003,
        status: 'approved',
        collector_id: Number(mpUserId),
        external_reference: reference,
        transaction_amount: 1000,
        currency_id: 'COP',
      },
    });
    const res = await notify('900003').expect(200);
    expect(res.body.applied).toBe(false);
    const audits = await admin.auditLog.findMany({
      where: { organizationId: orgId, action: 'donation.payment_mismatch' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it('a valid notification approves the donation once and issues one receipt', async () => {
    // ESAL with RTE, so the approval also issues a tax certificate.
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ nit: `9${String(Date.now()).slice(-8)}-1` })
      .expect(200);
    await admin.organizationProfile.update({
      where: { organizationId: orgId },
      data: { formalizationState: 'esal_rte', rteVigente: true },
    });
    const res = await notify('900001').expect(200);
    expect(res.body).toEqual({ applied: true, status: 'approved', donationId });
    const again = await notify('900001').expect(200);
    expect(again.body.applied).toBe(false);
    const receipts = await admin.donationReceipt.findMany({ where: { donationId } });
    expect(receipts).toHaveLength(1);

    // Reconciliation row from the read-back (one per org + MP payment id).
    const rows = await admin.mercadoPagoPayment.findMany({
      where: { organizationId: orgId, mpPaymentId: '900001' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      collectorId: mpUserId,
      externalReference: reference,
      donationId,
      status: 'approved',
      currency: 'COP',
    });
    expect(Number(rows[0].transactionAmount)).toBe(amountCharged);
  });

  it('a later refund is audited on the org log (the receipt is never rewritten)', async () => {
    const totals = async () => ({
      summary: (
        await request(server)
          .get('/org/summary')
          .set('Authorization', `Bearer ${orgToken}`)
          .expect(200)
      ).body.donationsReceivedTotal as number,
      dashboard: (
        await request(server)
          .get('/org/dashboard/donations')
          .set('Authorization', `Bearer ${orgToken}`)
          .expect(200)
      ).body.donations?.netReceivedTotal as number,
    });
    const before = await totals();
    expect(before.summary).toBeGreaterThan(0);
    payments.set('900001', {
      token: orgAccess,
      body: { ...payments.get('900001')!.body, status: 'refunded' },
    });
    const res = await notify('900001').expect(200);
    expect(res.body.applied).toBe(false);
    await notify('900001').expect(200);
    const audits = await admin.auditLog.findMany({
      where: { organizationId: orgId, action: 'donation.reversed_at_gateway' },
    });
    expect(audits).toHaveLength(1);
    const donation = await admin.donation.findUnique({ where: { id: donationId } });
    expect(donation?.status).toBe('approved');
    // P1-1: lo que volvió al donante ya no cuenta como recibido.
    const after = await totals();
    expect(after.summary).toBe(0);
    expect(after.dashboard).toBe(0);

    const row = await admin.mercadoPagoPayment.findUnique({
      where: { organizationId_mpPaymentId: { organizationId: orgId, mpPaymentId: '900001' } },
    });
    expect(row?.status).toBe('refunded');
    // The certificate is now ANNULLED: one reversal row, the public check says so,
    // and the organization can no longer (re)generate it.
    const reversals = await admin.donationReversal.findMany({ where: { donationId } });
    expect(reversals).toHaveLength(1);
    expect(reversals[0].reason).toBe('refunded');
    const certificate = await admin.donationCertificate.findUnique({ where: { donationId } });
    expect(certificate).not.toBeNull();
    const verification = await request(server)
      .get(`/public/donations/certificates/${certificate!.code}`)
      .expect(200);
    expect(verification.body.revokedAt).toEqual(reversals[0].reversedAt.toISOString());
    expect(
      await admin.auditLog.count({
        where: { organizationId: orgId, action: 'donation.certificate_revoked' },
      }),
    ).toBe(1);
    await request(server)
      .post(`/donations/${donationId}/certificate`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(422);
    // The mismatched payment is kept too: reconciliation must see it.
    const mismatch = await admin.mercadoPagoPayment.findUnique({
      where: { organizationId_mpPaymentId: { organizationId: orgId, mpPaymentId: '900003' } },
    });
    expect(Number(mismatch?.transactionAmount)).toBe(1000);
  });

  it('an Orders notification settles the donation once, finding the org by external_reference', async () => {
    const res = await donate(`mp-${randomUUID()}`).expect(201);
    const ref = res.body.collectionId as string;
    const id = res.body.id as string;
    const charged = res.body.amountCharged as number;
    const order = (over: Record<string, unknown> = {}) => ({
      id: 'ORDTEST900',
      status: 'processed',
      status_detail: 'accredited',
      external_reference: ref,
      total_amount: charged.toFixed(2),
      total_paid_amount: charged.toFixed(2),
      transactions: {
        payments: [
          {
            id: 'PAY900',
            amount: charged.toFixed(2),
            status: 'processed',
            payment_method: { id: 'visa', type: 'credit_card' },
          },
        ],
      },
      ...over,
    });

    // Signed with the WRONG application secret (the shared one is not the Orders one).
    orders.set('ORDTEST900', { token: orgAccess, body: order() });
    await notifyOrder('ORDTEST900', { secret: SECRET, reference: ref }).expect(403);
    // A reference that is not ours or names no donation is acknowledged, never settled.
    const unknown = await notifyOrder('ORDTEST900', { reference: 'af-unknown' }).expect(200);
    expect(unknown.body.applied).toBe(false);
    const noRef = await notifyOrder('ORDTEST900').expect(200);
    expect(noRef.body.applied).toBe(false);
    // An order that the org's own token cannot read (another account) never settles.
    orders.set('ORDTEST901', { token: 'APP_USR-someone-else', body: order({ id: 'ORDTEST901' }) });
    await notifyOrder('ORDTEST901', { reference: ref }).expect(403);
    // Paid less than the total: pending, never approved.
    orders.set('ORDTEST902', {
      token: orgAccess,
      body: order({ id: 'ORDTEST902', total_paid_amount: '1000.00' }),
    });
    expect((await notifyOrder('ORDTEST902', { reference: ref }).expect(200)).body.applied).toBe(
      false,
    );
    // A different amount than the donation's is audited and never approves.
    orders.set('ORDTEST903', {
      token: orgAccess,
      body: order({ id: 'ORDTEST903', total_amount: '1000.00', total_paid_amount: '1000.00' }),
    });
    expect((await notifyOrder('ORDTEST903', { reference: ref }).expect(200)).body.applied).toBe(
      false,
    );
    expect((await admin.donation.findUnique({ where: { id } }))?.status).toBe('pending');

    const ok = await notifyOrder('ORDTEST900', { reference: ref }).expect(200);
    expect(ok.body).toEqual({ applied: true, status: 'approved', donationId: id });
    const again = await notifyOrder('ORDTEST900', { reference: ref }).expect(200);
    expect(again.body.applied).toBe(false);
    expect(await admin.donationReceipt.findMany({ where: { donationId: id } })).toHaveLength(1);
    const row = await admin.mercadoPagoPayment.findUnique({
      where: { organizationId_mpPaymentId: { organizationId: orgId, mpPaymentId: 'PAY900' } },
    });
    expect(row).toMatchObject({
      collectorId: mpUserId,
      externalReference: ref,
      donationId: id,
      status: 'approved',
      currency: 'COP',
    });
  });

  it('a grant Mercado Pago no longer honors blocks donations until the org reconnects', async () => {
    await admin.organizationMercadoPagoConnection.update({
      where: { organizationId: orgId },
      data: { expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    tokenResponse = { status: 400, body: { error: 'invalid_grant' } };
    const service = app.get(MercadoPagoConnectionsService);
    const result = await service.refreshDueConnections();
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const stored = await admin.organizationMercadoPagoConnection.findUnique({
      where: { organizationId: orgId },
    });
    expect(stored?.status).toBe('needs_reconnect');
    expect(await availability()).toBe(false);
    await donate(`mp-${randomUUID()}`).expect(409);
    const status = await request(server)
      .get('/org/mercadopago/status')
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    expect(status.body).toMatchObject({ connected: false, status: 'needs_reconnect' });
  });

  it('a successful renewal stores the new pair encrypted', async () => {
    const url = await connectUrl(orgToken);
    tokenResponse = { status: 200, body: grant() };
    await request(server)
      .get(`/org/mercadopago/callback?code=TG-code-3&state=${url.searchParams.get('state')}`)
      .set('Cookie', url.cookie)
      .expect(302);
    await admin.organizationMercadoPagoConnection.update({
      where: { organizationId: orgId },
      data: { expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    tokenResponse = {
      status: 200,
      body: grant({ access_token: 'APP_USR-renewed', refresh_token: 'TG-renewed' }),
    };
    const result = await app.get(MercadoPagoConnectionsService).refreshDueConnections();
    expect(result.refreshed).toBeGreaterThanOrEqual(1);
    expect(tokenRequests[tokenRequests.length - 1].get('grant_type')).toBe('refresh_token');
    const stored = await admin.organizationMercadoPagoConnection.findUnique({
      where: { organizationId: orgId },
    });
    expect(stored?.status).toBe('active');
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 100 * 24 * 60 * 60 * 1000);
    expect(stored?.accessTokenEnc).not.toContain('APP_USR-renewed');
  });

  it('disconnect deletes the tokens and blocks donations again', async () => {
    await request(server)
      .delete('/org/mercadopago/connect')
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    expect(
      await admin.organizationMercadoPagoConnection.findUnique({
        where: { organizationId: orgId },
      }),
    ).toBeNull();
    expect(await availability()).toBe(false);
  });

  describe("AdoptaFácil's plan, charged with the PLATFORM account", () => {
    const notifyBilling = (dataId: string, type: string, secret = SECRET) => {
      const ts = String(Math.floor(Date.now() / 1000));
      const requestId = randomUUID();
      const v1 = mercadoPagoSignatureV1(secret, dataId, requestId, ts);
      return request(server)
        .post(`/billing/webhooks/mercadopago?data.id=${dataId}&type=${type}`)
        .set('x-signature', `ts=${ts},v1=${v1}`)
        .set('x-request-id', requestId)
        .send({ type, data: { id: dataId } });
    };

    let preapprovalId = '';

    it('while plans are not enforced (everyone has Pro free) checkout is refused with 409', async () => {
      const before = preapprovals.size;
      await request(server)
        .post('/org/plan/checkout')
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ plan: 'pro' })
        .expect(409);
      expect(preapprovals.size).toBe(before);
      // The rest of this block runs with plans enforced.
      Object.defineProperty(app.get(PlansService), 'enforced', { value: true, configurable: true });
    });

    it('checkout creates a monthly subscription with the platform token', async () => {
      const res = await request(server)
        .post('/org/plan/checkout')
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ plan: 'crece' })
        .expect(200);
      expect(res.body).toMatchObject({
        plan: 'crece',
        monthlyAmountCop: planMonthlyAmount('crece', 0),
      });
      expect(res.body.checkoutUrl).toMatch(/^https:\/\/www\.mercadopago\.com\.co\//);
      preapprovalId = [...preapprovals.keys()].pop() as string;
      const created = preapprovals.get(preapprovalId)!;
      expect(created.external_reference).toBe(planSubscriptionReference(orgId, 'crece'));
      expect(created.auto_recurring).toMatchObject({
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: planMonthlyAmount('crece', 0),
        currency_id: 'COP',
      });
    });

    it('a forged subscription notification is 403 and changes nothing', async () => {
      await notifyBilling(preapprovalId, 'subscription_preapproval', 'nope').expect(403);
      expect(
        await admin.organizationSubscription.findUnique({ where: { organizationId: orgId } }),
      ).toBeNull();
    });

    it('an authorized subscription alone activates nothing; an APPROVED charge does', async () => {
      const next = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      preapprovals.set(preapprovalId, {
        ...preapprovals.get(preapprovalId)!,
        status: 'authorized',
        next_payment_date: next.toISOString(),
      });
      const res = await notifyBilling(preapprovalId, 'subscription_preapproval').expect(200);
      expect(res.body.applied).toBe(false);
      let sub = await admin.organizationSubscription.findUnique({
        where: { organizationId: orgId },
      });
      expect(sub?.status === 'active' && sub.plan === 'crece').toBe(false);

      // A charge that is not approved changes nothing either.
      authorizedPayments.set('ap-0', {
        id: 'ap-0',
        preapproval_id: preapprovalId,
        status: 'recycling',
        payment: { id: 0, status: 'rejected' },
        transaction_amount: planMonthlyAmount('crece', 0),
        currency_id: 'COP',
        debit_date: new Date().toISOString(),
      });
      await notifyBilling('ap-0', 'subscription_authorized_payment').expect(200);
      sub = await admin.organizationSubscription.findUnique({ where: { organizationId: orgId } });
      expect(sub?.status === 'active' && sub.plan === 'crece').toBe(false);

      const chargedAt = new Date();
      authorizedPayments.set('ap-1', {
        id: 'ap-1',
        preapproval_id: preapprovalId,
        status: 'processed',
        payment: { id: 1, status: 'approved' },
        transaction_amount: planMonthlyAmount('crece', 0),
        currency_id: 'COP',
        debit_date: chargedAt.toISOString(),
      });
      const charged = await notifyBilling('ap-1', 'subscription_authorized_payment').expect(200);
      expect(charged.body.applied).toBe(true);
      sub = await admin.organizationSubscription.findUnique({ where: { organizationId: orgId } });
      expect(sub).toMatchObject({
        plan: 'crece',
        status: 'active',
        provider: 'mercadopago',
        providerReference: preapprovalId,
      });
      expect(sub?.currentPeriodEnd?.getTime()).toBe(addOneMonth(chargedAt).getTime());
      // Repeated delivery: same row, no new audit.
      const again = await notifyBilling('ap-1', 'subscription_authorized_payment').expect(200);
      expect(again.body.applied).toBe(false);
    });

    it('a subscription with a tampered amount never activates a plan (audited)', async () => {
      preapprovals.set('preap-evil', {
        id: 'preap-evil',
        status: 'authorized',
        external_reference: planSubscriptionReference(orgId, 'pro'),
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 1000,
          currency_id: 'COP',
        },
      });
      const res = await notifyBilling('preap-evil', 'subscription_preapproval').expect(200);
      expect(res.body.applied).toBe(false);
      const sub = await admin.organizationSubscription.findUnique({
        where: { organizationId: orgId },
      });
      expect(sub?.plan).toBe('crece');
      const audits = await admin.auditLog.findMany({
        where: { organizationId: orgId, action: 'organization.plan_payment_mismatch' },
      });
      expect(audits).toHaveLength(1);
    });

    it('cancelling the subscription in Mercado Pago marks the plan canceled', async () => {
      preapprovals.set(preapprovalId, {
        ...preapprovals.get(preapprovalId)!,
        status: 'cancelled',
      });
      await notifyBilling(preapprovalId, 'subscription_preapproval').expect(200);
      const sub = await admin.organizationSubscription.findUnique({
        where: { organizationId: orgId },
      });
      expect(sub?.status).toBe('canceled');
      // The paid period is kept: grace rules decide when it falls back to free.
      expect(sub?.currentPeriodEnd).not.toBeNull();
    });
  });
});
