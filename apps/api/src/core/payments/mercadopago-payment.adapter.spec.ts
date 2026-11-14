import type { ConfigService } from '@nestjs/config';
import {
  computeBreakdown,
  type CreateCollectionInput,
  type MercadoPagoCollectorCredentials,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import {
  assertMercadoPagoSignature,
  MERCADOPAGO_REFERENCE_MAX_LENGTH,
  MercadoPagoPaymentAdapter,
  mercadoPagoNotificationDataId,
  mercadoPagoPaymentSnapshot,
  mercadoPagoReferenceFor,
  mercadoPagoSignatureV1,
} from './mercadopago-payment.adapter';

const ORG_ID = '11111111-2222-3333-4444-555555555555';
const ORG: MercadoPagoCollectorCredentials = {
  organizationId: ORG_ID,
  userId: '123456789',
  accessToken: 'APP_USR-org-token-secret',
};
const SECRET = 'webhook-secret-for-tests';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    MERCADOPAGO_BASE_URL: 'https://api.mp.test',
    API_PUBLIC_BASE_URL: 'https://api.adoptafacil.test',
    WEB_BASE_URL: 'https://app.adoptafacil.test',
    MERCADOPAGO_WEBHOOK_SECRET: SECRET,
    MERCADOPAGO_TEST: false,
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ORDER = {
  id: 'ORDTST01KS5AJ6HTK2HRQ3XJ3C2JCKP9',
  status: 'created',
  checkout_url:
    'https://www.mercadopago.com.co/checkout/v1/redirect?order_id=ORDTST01KS5AJ6HTK2HRQ3XJ3C2JCKP9',
};

function makeFetch(
  payment: Record<string, unknown> = {},
  order: unknown = ORDER,
  readOrder: Record<string, unknown> | null = null,
) {
  return jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u === 'https://api.mp.test/v1/orders' && init?.method === 'POST') return json(order);
    if (u.startsWith('https://api.mp.test/v1/orders/'))
      return readOrder ? json(readOrder) : json({}, 404);
    if (u.startsWith('https://api.mp.test/v1/payments/'))
      return json({ live_mode: true, ...payment });
    return json({}, 404);
  });
}

const INPUT: CreateCollectionInput = {
  intendedAmount: 50_000,
  currency: 'COP',
  concept: { kind: 'organization', id: ORG_ID },
  payer: { email: 'donante@test.local', fullName: 'Ana Donante' },
  idempotencyKey: 'idem-1',
  mercadopagoCollector: ORG,
};

function signedContext(dataId: string, overrides: { ts?: string; requestId?: string } = {}) {
  const ts = overrides.ts ?? '1704908010';
  const requestId = overrides.requestId ?? 'req-1';
  const v1 = mercadoPagoSignatureV1(SECRET, dataId, requestId, ts);
  return {
    signature: `ts=${ts},v1=${v1}`,
    context: {
      headers: { 'x-request-id': requestId },
      query: { 'data.id': dataId, type: 'payment' },
      mercadopagoCollector: ORG,
    },
  };
}

describe('MercadoPagoPaymentAdapter (ADR-PAG-003, OAuth del refugio)', () => {
  it('refuses to charge without the organization grant (no custody fallback)', async () => {
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), makeFetch());
    await expect(
      adapter.createCollection({ ...INPUT, mercadopagoCollector: undefined }),
    ).rejects.toThrow(/custody/);
  });

  it("creates the Checkout Pro ORDER WITH THE ORG's token, no platform fee", async () => {
    const fetchFn = makeFetch();
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);
    const result = await adapter.createCollection(INPUT);

    const reference = mercadoPagoReferenceFor(ORG_ID, 'idem-1');
    expect(reference.length).toBeLessThanOrEqual(MERCADOPAGO_REFERENCE_MAX_LENGTH);
    const breakdown = computeBreakdown(50_000);
    expect(breakdown.platformFee).toBe(0);
    expect(result).toEqual({
      collectionId: reference,
      status: 'pending',
      breakdown,
      paymentLinkUrl: ORDER.checkout_url,
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://api.mp.test/v1/orders');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ORG.accessToken}`);
    expect(headers['X-Idempotency-Key']).toBe(reference);
    const body = JSON.parse(String(init?.body));
    const amount = breakdown.amountCharged.toFixed(2);
    expect(body).toMatchObject({
      type: 'online',
      processing_mode: 'manual',
      total_amount: amount,
      external_reference: reference,
      items: [{ title: 'Donación', unit_price: amount, quantity: 1 }],
      payer: { email: 'donante@test.local' },
      expiration_time: 'P3D',
    });
    const back = `https://app.adoptafacil.test/donaciones/resultado?reference=${reference}`;
    expect(body.config.online).toEqual({
      success_url: back,
      pending_url: back,
      failure_url: back,
      auto_return: 'approved',
    });
    // Orders has no per-order notification URL (it is set on the application).
    expect(body.notification_url).toBeUndefined();
    // No split field: AdoptaFácil never takes a cut at source.
    expect(body.marketplace_fee).toBeUndefined();
    expect(body.application_fee).toBeUndefined();
    // Nothing personal beyond the email the payer gave; never the org token.
    expect(JSON.stringify(body)).not.toContain('Ana Donante');
    expect(JSON.stringify(body)).not.toContain(ORG.accessToken);
  });

  it('sends no payer when the donor gave no email', async () => {
    const fetchFn = makeFetch();
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);
    await adapter.createCollection({ ...INPUT, payer: undefined });
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).payer).toBeUndefined();
  });

  it('in sandbox never sends the donor email (only the configured test buyer)', async () => {
    const fetchFn = makeFetch();
    const sandbox = new MercadoPagoPaymentAdapter(makeConfig({ MERCADOPAGO_TEST: true }), fetchFn);
    await sandbox.createCollection(INPUT);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).payer).toBeUndefined();

    const withBuyer = makeFetch();
    const configured = new MercadoPagoPaymentAdapter(
      makeConfig({ MERCADOPAGO_TEST: true, MERCADOPAGO_TEST_PAYER_EMAIL: 'buyer@testuser.com' }),
      withBuyer,
    );
    await configured.createCollection(INPUT);
    expect(JSON.parse(String(withBuyer.mock.calls[0][1]?.body)).payer).toEqual({
      email: 'buyer@testuser.com',
    });
  });

  it('says why Mercado Pago refused the order, without the token or the payer', async () => {
    const failing = new MercadoPagoPaymentAdapter(
      makeConfig(),
      jest.fn(async () =>
        json(
          {
            errors: [
              {
                code: 'invalid_users_involved',
                message: `payer donante@test.local cannot pay ${ORG.accessToken}`,
                details: [],
              },
            ],
          },
          400,
        ),
      ),
    );
    const error = await failing.createCollection(INPUT).catch((e: Error) => e);
    expect(String(error)).toMatch(/order create failed \(400: invalid_users_involved/);
    expect(String(error)).not.toContain(ORG.accessToken);
    expect(String(error)).not.toContain('donante@test.local');
  });

  it('uses the same checkout_url in test mode (the order id carries the mode)', async () => {
    const adapter = new MercadoPagoPaymentAdapter(
      makeConfig({ MERCADOPAGO_TEST: true }),
      makeFetch(),
    );
    const result = await adapter.createCollection(INPUT);
    expect(result.paymentLinkUrl).toBe(ORDER.checkout_url);
  });

  it('refuses an order whose link is not a Mercado Pago checkout or that fails', async () => {
    const evil = new MercadoPagoPaymentAdapter(
      makeConfig(),
      makeFetch({}, { ...ORDER, checkout_url: 'https://evil.test/pay' }),
    );
    await expect(evil.createCollection(INPUT)).rejects.toThrow(/checkout link/);
    const legacyShape = new MercadoPagoPaymentAdapter(
      makeConfig(),
      makeFetch({}, { id: 'x', init_point: ORDER.checkout_url }),
    );
    await expect(legacyShape.createCollection(INPUT)).rejects.toThrow(/checkout link/);
    const failing = new MercadoPagoPaymentAdapter(
      makeConfig(),
      jest.fn(async () => json({}, 400)),
    );
    await expect(failing.createCollection(INPUT)).rejects.toThrow(/order create failed \(400\)/);
  });

  it('settles only a signed notification whose payment, read with the ORG token, is the org’s', async () => {
    const payment = {
      id: 987654321,
      status: 'approved',
      collector_id: 123456789,
      external_reference: 'af-ref',
      transaction_amount: 50000,
      currency_id: 'COP',
    };
    const fetchFn = makeFetch(payment);
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);
    const { signature, context } = signedContext('987654321');

    const event = await adapter.verifyAndNormalizeWebhook({ type: 'payment' }, signature, context);
    expect(event).toEqual({
      eventId: '987654321',
      collectionId: 'af-ref',
      status: 'approved',
      dedupKey: 'mercadopago:987654321:approved',
      amountCharged: 50000,
      currency: 'COP',
      receiverAccountId: '123456789',
      mercadopagoPayment: expect.objectContaining({
        paymentId: '987654321',
        collectorId: '123456789',
        externalReference: 'af-ref',
        transactionAmount: '50000',
      }),
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://api.mp.test/v1/payments/987654321');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${ORG.accessToken}`,
    );
  });

  it('rejects a bad signature, a missing request id and a payment of another collector', async () => {
    const adapter = new MercadoPagoPaymentAdapter(
      makeConfig(),
      makeFetch({ id: 1, status: 'approved', collector_id: 42, external_reference: 'af-x' }),
    );
    const { signature, context } = signedContext('1');
    await expect(
      adapter.verifyAndNormalizeWebhook({}, signature.replace(/v1=./, 'v1=0'), context),
    ).rejects.toThrow(/signature/);
    await expect(
      adapter.verifyAndNormalizeWebhook({}, signature, { ...context, headers: {} }),
    ).rejects.toThrow(/missing signature/);
    await expect(adapter.verifyAndNormalizeWebhook({}, signature, context)).rejects.toThrow(
      /another collector/,
    );
  });

  it('rejects a payment whose live_mode does not match MERCADOPAGO_TEST', async () => {
    const sandboxPayment = {
      id: 7,
      status: 'approved',
      live_mode: false,
      collector_id: 123456789,
      external_reference: 'af-ref',
      transaction_amount: 50000,
      currency_id: 'COP',
    };
    const prod = new MercadoPagoPaymentAdapter(makeConfig(), makeFetch(sandboxPayment));
    const signed7 = signedContext('7');
    await expect(
      prod.verifyAndNormalizeWebhook({}, signed7.signature, signed7.context),
    ).rejects.toThrow(/live_mode/);
    const sandbox = new MercadoPagoPaymentAdapter(
      makeConfig({ MERCADOPAGO_TEST: true }),
      makeFetch({ ...sandboxPayment, live_mode: true }),
    );
    await expect(
      sandbox.verifyAndNormalizeWebhook({}, signed7.signature, signed7.context),
    ).rejects.toThrow(/live_mode/);
  });

  it('every call to Mercado Pago carries a timeout signal', async () => {
    const fetchFn = makeFetch({
      id: 8,
      status: 'approved',
      collector_id: 123456789,
      external_reference: 'af-ref',
      transaction_amount: 50000,
      currency_id: 'COP',
    });
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), fetchFn);
    const signed8 = signedContext('8');
    await adapter.verifyAndNormalizeWebhook({}, signed8.signature, signed8.context);
    expect(fetchFn.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects a notification when the org has no grant', async () => {
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), makeFetch());
    const { signature, context } = signedContext('1');
    await expect(
      adapter.verifyAndNormalizeWebhook({}, signature, {
        ...context,
        mercadopagoCollector: undefined,
      }),
    ).rejects.toThrow(/no connected organization/);
  });

  it('maps refunds/chargebacks to voided and a decimal amount to NaN (never matches)', async () => {
    const adapter = new MercadoPagoPaymentAdapter(
      makeConfig(),
      makeFetch({
        id: 5,
        status: 'charged_back',
        collector_id: 123456789,
        external_reference: 'af-ref',
        transaction_amount: 50000.5,
        currency_id: 'COP',
      }),
    );
    const { signature, context } = signedContext('5');
    const event = await adapter.verifyAndNormalizeWebhook({}, signature, context);
    expect(event.status).toBe('voided');
    expect(Number.isNaN(event.amountCharged)).toBe(true);
  });

  describe('Orders notifications', () => {
    const ORDERS_SECRET = 'orders-webhook-secret-for-tests';
    const orderConfig = () => makeConfig({ MERCADOPAGO_ORDERS_WEBHOOK_SECRET: ORDERS_SECRET });
    const signedOrder = (dataId: string, secret = ORDERS_SECRET) => {
      const ts = '1704908010';
      const v1 = mercadoPagoSignatureV1(secret, dataId, 'req-9', ts);
      return {
        signature: `ts=${ts},v1=${v1}`,
        context: {
          headers: { 'x-request-id': 'req-9' },
          query: { 'data.id': dataId, type: 'order' },
          mercadopagoCollector: ORG,
        },
      };
    };
    const paid = {
      id: 'ORD01JRTXT3GC8CJGW394QWYQ9VP3',
      status: 'processed',
      status_detail: 'accredited',
      external_reference: 'af-ref',
      total_amount: '50000.00',
      total_paid_amount: '50000.00',
      transactions: {
        payments: [
          {
            id: 'PAY01JRTXT3GC8CJGW394QZZ349N6',
            amount: '50000.00',
            paid_amount: '50000.00',
            status: 'processed',
            payment_method: { id: 'master', type: 'credit_card', installments: 1 },
          },
        ],
      },
    };

    it('reads the order back with the ORG token and approves a fully paid, processed order', async () => {
      const fetchFn = makeFetch({}, ORDER, { live_mode: true, ...paid });
      const adapter = new MercadoPagoPaymentAdapter(orderConfig(), fetchFn);
      const { signature, context } = signedOrder(paid.id);
      const event = await adapter.verifyAndNormalizeWebhook({ type: 'order' }, signature, context);
      expect(event).toEqual({
        eventId: paid.id,
        collectionId: 'af-ref',
        status: 'approved',
        dedupKey: `mercadopago:${paid.id}:approved`,
        amountCharged: 50000,
        currency: 'COP',
        receiverAccountId: '123456789',
        mercadopagoPayment: expect.objectContaining({
          paymentId: 'PAY01JRTXT3GC8CJGW394QZZ349N6',
          collectorId: '123456789',
          externalReference: 'af-ref',
          status: 'approved',
          transactionAmount: '50000.00',
          paymentMethodId: 'master',
          paymentTypeId: 'credit_card',
          netReceivedAmount: null,
        }),
      });
      const [url, init] = fetchFn.mock.calls[0];
      expect(String(url)).toBe(`https://api.mp.test/v1/orders/${paid.id}`);
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${ORG.accessToken}`,
      );
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('is signed with the Orders application secret (the shared one is not enough)', async () => {
      const readOrder = { live_mode: true, ...paid };
      const adapter = new MercadoPagoPaymentAdapter(orderConfig(), makeFetch({}, ORDER, readOrder));
      const wrong = signedOrder(paid.id, SECRET);
      await expect(
        adapter.verifyAndNormalizeWebhook({}, wrong.signature, wrong.context),
      ).rejects.toThrow(/signature mismatch/);
      // Without a dedicated secret it falls back to the shared one.
      const fallback = new MercadoPagoPaymentAdapter(makeConfig(), makeFetch({}, ORDER, readOrder));
      const shared = signedOrder(paid.id, SECRET);
      await expect(
        fallback.verifyAndNormalizeWebhook({}, shared.signature, shared.context),
      ).resolves.toMatchObject({ status: 'approved' });
    });

    it('rejects an order the org token cannot read, a sandbox order and one without reference', async () => {
      const { signature, context } = signedOrder(paid.id);
      const unreadable = new MercadoPagoPaymentAdapter(orderConfig(), makeFetch({}, ORDER, null));
      await expect(unreadable.verifyAndNormalizeWebhook({}, signature, context)).rejects.toThrow(
        /order read-back failed \(404\)/,
      );
      const sandbox = new MercadoPagoPaymentAdapter(
        orderConfig(),
        makeFetch({}, ORDER, { ...paid, live_mode: false }),
      );
      await expect(sandbox.verifyAndNormalizeWebhook({}, signature, context)).rejects.toThrow(
        /live_mode/,
      );
      const noRef = new MercadoPagoPaymentAdapter(
        orderConfig(),
        makeFetch({}, ORDER, { ...paid, external_reference: undefined }),
      );
      await expect(noRef.verifyAndNormalizeWebhook({}, signature, context)).rejects.toThrow(
        /no external_reference/,
      );
    });

    it('maps order statuses: only `processed` approves, refunds void, the rest is pending', async () => {
      const statusOf = async (over: Record<string, unknown>) => {
        const adapter = new MercadoPagoPaymentAdapter(
          orderConfig(),
          makeFetch({}, ORDER, { ...paid, ...over }),
        );
        const { signature, context } = signedOrder(paid.id);
        return (await adapter.verifyAndNormalizeWebhook({}, signature, context)).status;
      };
      expect(await statusOf({ status: 'refunded' })).toBe('voided');
      expect(await statusOf({ status: 'charged_back' })).toBe('voided');
      expect(await statusOf({ status: 'canceled' })).toBe('voided');
      expect(await statusOf({ status: 'failed' })).toBe('declined');
      for (const status of ['created', 'action_required', 'expired', 'something_new']) {
        expect(await statusOf({ status })).toBe('pending');
      }
      // Processed but not paid in full: never approves.
      expect(await statusOf({ total_paid_amount: '1000.00' })).toBe('pending');
    });
  });

  it('never polls a status without the org grant', async () => {
    const adapter = new MercadoPagoPaymentAdapter(makeConfig(), makeFetch());
    await expect(adapter.getCollectionStatus('af-x')).rejects.toThrow();
  });
});

describe('Mercado Pago notification helpers', () => {
  it('reads data.id from the query first, then the body, and refuses odd ids', () => {
    expect(mercadoPagoNotificationDataId({ data: { id: 7 } }, {})).toBe('7');
    expect(mercadoPagoNotificationDataId({ data: { id: 7 } }, { 'data.id': '8' })).toBe('8');
    expect(mercadoPagoNotificationDataId({ data: { id: '../x' } }, {})).toBeUndefined();
  });

  it('lowercases alphanumeric ids in the manifest, as documented', () => {
    const v1 = mercadoPagoSignatureV1(SECRET, 'abc', 'r', '1');
    expect(() => assertMercadoPagoSignature(SECRET, `ts=1,v1=${v1}`, 'r', 'ABC')).not.toThrow();
    expect(() => assertMercadoPagoSignature(undefined, `ts=1,v1=${v1}`, 'r', 'abc')).toThrow();
  });

  it('keeps a payer-free reconciliation snapshot of the read-back (fees, net, refunds)', () => {
    const snap = mercadoPagoPaymentSnapshot(
      {
        status: 'refunded',
        status_detail: 'refunded',
        currency_id: 'COP',
        transaction_amount: 52500,
        transaction_amount_refunded: 52500,
        transaction_details: { net_received_amount: 50000.5 },
        fee_details: [{ type: 'mercadopago_fee', amount: 2499.5, fee_payer: 'collector' }],
        refunds: [{ id: 77, amount: 52500, status: 'approved', date_created: '2026-11-06' }],
        payment_type_id: 'credit_card',
        payment_method_id: 'visa',
        date_approved: '2026-11-05T10:00:00.000-05:00',
        money_release_date: '2026-11-19T10:00:00.000-05:00',
        payer: { email: 'someone@example.com', identification: { number: '123' } },
      },
      '987654321',
      '123456789',
      'af-ref',
    );
    expect(snap).toMatchObject({
      paymentId: '987654321',
      collectorId: '123456789',
      status: 'refunded',
      transactionAmount: '52500',
      netReceivedAmount: '50000.5',
      transactionAmountRefunded: '52500',
      feeDetails: [{ type: 'mercadopago_fee', amount: '2499.5', fee_payer: 'collector' }],
      refunds: [{ id: '77', amount: '52500', status: 'approved' }],
    });
    expect(JSON.stringify(snap)).not.toContain('someone@example.com');
  });
});
