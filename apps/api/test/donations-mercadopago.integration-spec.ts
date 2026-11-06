import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  computeBreakdown,
  DIRECT_COLLECTION_RATES,
  planSubscriptionReference,
} from '@adoptafacil/contracts';
import { mercadoPagoSignatureV1 } from '../src/core/payments/mercadopago-payment.adapter';
import { planMonthlyAmount } from '../src/core/plans/plan-billing.service';
import { PlansService } from '../src/core/plans/plans.service';
import { MercadoPagoConnectionsService } from '../src/modules/payments/mercadopago-connections.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_GUEST, LEGAL_ORG } from './support/legal';

/**
 * Mercado Pago end to end (ADR-PAG-003) with PAYMENT_DRIVER=mercadopago and
 * ZERO network (every Mercado Pago call is a mocked global fetch):
 *   - the Owner connects the org's OWN account by OAuth (sealed state,
 *     tokens encrypted at rest, never echoed, audited without tokens);
 *   - one Mercado Pago account cannot back two organizations;
 *   - a guest donation is a Checkout Pro preference created with the ORG's
 *     token (no platform fee, no platform token);
 *   - the signed notification is read back with the org's token: forged
 *     signature 403, another collector 403, amount mismatch never approves,
 *     valid approves once, a refund is audited;
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
  const preapprovals = new Map<string, Record<string, unknown>>();
  const authorizedPayments = new Map<string, Record<string, unknown>>();

  beforeAll(async () => {
    process.env.PAYMENT_DRIVER = 'mercadopago';
    process.env.MERCADOPAGO_BASE_URL = 'https://api.mp.test';
    process.env.MERCADOPAGO_CLIENT_ID = '5550001';
    process.env.MERCADOPAGO_CLIENT_SECRET = 'mp-client-secret-integration';
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
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
      if (u === 'https://api.mp.test/checkout/preferences') {
        const body = JSON.parse(String(init?.body));
        preferenceCalls.push({ auth, body });
        return json({
          id: `pref-${preferenceCalls.length}`,
          collector_id: Number(mpUserId),
          init_point: `https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-${preferenceCalls.length}`,
        });
      }
      const pay = /^https:\/\/api\.mp\.test\/v1\/payments\/(\w+)$/.exec(u);
      if (pay) {
        const found = payments.get(pay[1]);
        // Mercado Pago scopes reads to the token owner: another token ⇒ 404.
        return found && auth === `Bearer ${found.token}` ? json(found.body) : json({}, 404);
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
        commissionPayer: 'donor',
        idempotencyKey,
        payer: { email: 'donante@test.local' },
      });

  const availability = async () =>
    (await request(server).get(`/public/donations/organizations/${orgId}/availability`).expect(200))
      .body.canReceiveDonations;

  const connectUrl = async (token: string) => {
    const res = await request(server)
      .get('/org/mercadopago/connect')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return new URL(res.body.authorizeUrl);
  };

  const grant = (over: Record<string, unknown> = {}) => ({
    access_token: orgAccess,
    refresh_token: orgRefresh,
    expires_in: 15_552_000,
    user_id: Number(mpUserId),
    public_key: 'APP_USR-public',
    live_mode: false,
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
      .expect(302);
    expect(res.headers.location).toMatch(/mercadopago=expired$/);
    await request(server).get('/org/mercadopago/callback?code=TG-code').expect(302);
    expect(tokenRequests).toHaveLength(0);
  });

  it('the org declining on Mercado Pago is reported as denied', async () => {
    const url = await connectUrl(orgToken);
    const res = await request(server)
      .get(`/org/mercadopago/callback?error=access_denied&state=${url.searchParams.get('state')}`)
      .expect(302);
    expect(res.headers.location).toMatch(/mercadopago=denied$/);
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
      liveMode: false,
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
      .expect(302);
    expect(res.headers.location).toMatch(/mercadopago=already_linked$/);
  });

  let reference = '';
  let amountCharged = 0;
  let donationId = '';

  it("a guest donation is a Checkout Pro preference created with the ORG's token, no platform fee", async () => {
    const res = await donate(`mp-${randomUUID()}`).expect(201);
    const expected = computeBreakdown(50000, 'donor', DIRECT_COLLECTION_RATES);
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
      external_reference: reference,
      notification_url: `https://api.adoptafacil.test/donations/webhook/mercadopago/${orgId}?source_news=webhooks`,
    });
    expect((call.body.items as Record<string, unknown>[])[0].unit_price).toBe(
      expected.amountCharged,
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

    const row = await admin.mercadoPagoPayment.findUnique({
      where: { organizationId_mpPaymentId: { organizationId: orgId, mpPaymentId: '900001' } },
    });
    expect(row?.status).toBe('refunded');
    // The mismatched payment is kept too: reconciliation must see it.
    const mismatch = await admin.mercadoPagoPayment.findUnique({
      where: { organizationId_mpPaymentId: { organizationId: orgId, mpPaymentId: '900003' } },
    });
    expect(Number(mismatch?.transactionAmount)).toBe(1000);
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

    it('an authorized subscription activates the plan; a confirmed charge extends it', async () => {
      const next = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      preapprovals.set(preapprovalId, {
        ...preapprovals.get(preapprovalId)!,
        status: 'authorized',
        next_payment_date: next.toISOString(),
      });
      const res = await notifyBilling(preapprovalId, 'subscription_preapproval').expect(200);
      expect(res.body.applied).toBe(true);
      let sub = await admin.organizationSubscription.findUnique({
        where: { organizationId: orgId },
      });
      expect(sub).toMatchObject({
        plan: 'crece',
        status: 'active',
        provider: 'mercadopago',
        providerReference: preapprovalId,
      });
      // Repeated delivery: same row, no new audit.
      const again = await notifyBilling(preapprovalId, 'subscription_preapproval').expect(200);
      expect(again.body.applied).toBe(false);

      const chargedAt = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);
      authorizedPayments.set('ap-1', {
        id: 'ap-1',
        preapproval_id: preapprovalId,
        status: 'processed',
        payment: { id: 1, status: 'approved' },
        transaction_amount: planMonthlyAmount('crece', 0),
        currency_id: 'COP',
        debit_date: chargedAt.toISOString(),
      });
      await notifyBilling('ap-1', 'subscription_authorized_payment').expect(200);
      sub = await admin.organizationSubscription.findUnique({ where: { organizationId: orgId } });
      expect(sub?.currentPeriodEnd?.getTime()).toBeGreaterThan(next.getTime());
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
