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

const PREFERENCE = {
  id: 'pref-1',
  collector_id: 123456789,
  init_point: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-1',
  sandbox_init_point: 'https://sandbox.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-1',
};

function makeFetch(payment: Record<string, unknown> = {}, preference: unknown = PREFERENCE) {
  return jest.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const u = String(url);
    if (u === 'https://api.mp.test/checkout/preferences') return json(preference);
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

  it("creates the Checkout Pro preference WITH THE ORG's token, no platform fee", async () => {
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
      paymentLinkUrl: PREFERENCE.init_point,
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://api.mp.test/checkout/preferences');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ORG.accessToken}`);
    expect(headers['X-Idempotency-Key']).toBe(reference);
    const body = JSON.parse(String(init?.body));
    expect(body.external_reference).toBe(reference);
    expect(body.items[0]).toMatchObject({
      quantity: 1,
      currency_id: 'COP',
      unit_price: breakdown.amountCharged,
    });
    expect(body.notification_url).toBe(
      `https://api.adoptafacil.test/donations/webhook/mercadopago/${ORG_ID}?source_news=webhooks`,
    );
    expect(body.back_urls.success).toBe(
      `https://app.adoptafacil.test/donaciones/resultado?reference=${reference}`,
    );
    // No split field: AdoptaFácil never takes a cut at source.
    expect(body.marketplace_fee).toBeUndefined();
    expect(body.application_fee).toBeUndefined();
    // Nothing personal beyond what the payer gave; never the org token.
    expect(JSON.stringify(body)).not.toContain(ORG.accessToken);
  });

  it('uses the sandbox link in test mode', async () => {
    const adapter = new MercadoPagoPaymentAdapter(
      makeConfig({ MERCADOPAGO_TEST: true }),
      makeFetch(),
    );
    const result = await adapter.createCollection(INPUT);
    expect(result.paymentLinkUrl).toBe(PREFERENCE.sandbox_init_point);
  });

  it('refuses a preference whose link is not a Mercado Pago checkout or names another collector', async () => {
    const evil = new MercadoPagoPaymentAdapter(
      makeConfig(),
      makeFetch({}, { ...PREFERENCE, init_point: 'https://evil.test/pay' }),
    );
    await expect(evil.createCollection(INPUT)).rejects.toThrow(/checkout link/);
    const other = new MercadoPagoPaymentAdapter(
      makeConfig(),
      makeFetch({}, { ...PREFERENCE, collector_id: 999 }),
    );
    await expect(other.createCollection(INPUT)).rejects.toThrow(/another collector/);
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
