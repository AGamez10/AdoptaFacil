import { createHmac } from 'node:crypto';
import {
  MercadoPagoOAuthClient,
  MercadoPagoOAuthError,
  type MercadoPagoFetch,
} from './mercadopago-oauth.client';
import {
  computeApplicationFee,
  MercadoPagoApiError,
  MercadoPagoSplitClient,
  parseSignatureHeader,
  verifyWebhookSignature,
  webhookManifest,
} from './mercadopago-split.client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next;
  }) as unknown as MercadoPagoFetch;
  return { fn, calls };
}

const OAUTH_CONFIG = {
  clientId: '1234567890',
  clientSecret: 'client-secret-value',
  redirectUri: 'https://app.adoptafacil.test/org/mercadopago/callback',
  baseUrl: 'https://mp.test',
};

describe('MercadoPagoOAuthClient', () => {
  it('builds the Colombia authorize URL with offline_access', () => {
    const url = new URL(new MercadoPagoOAuthClient(OAUTH_CONFIG).buildAuthorizeUrl('st-1'));
    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com.co/authorization');
    expect(url.searchParams.get('client_id')).toBe('1234567890');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('offline_access');
    expect(url.searchParams.get('state')).toBe('st-1');
    expect(url.searchParams.get('redirect_uri')).toBe(OAUTH_CONFIG.redirectUri);
    expect(url.toString()).not.toContain('client-secret-value');
  });

  it('exchanges the code at /oauth/token with authorization_code', async () => {
    const { fn, calls } = mockFetch(
      jsonResponse(200, { access_token: 'APP_USR-seller', user_id: 42, public_key: 'pk' }),
    );
    const tokens = await new MercadoPagoOAuthClient(OAUTH_CONFIG, fn).exchangeCode('TG-code');
    expect(tokens.user_id).toBe(42);
    expect(calls[0].url).toBe('https://mp.test/oauth/token');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      client_id: '1234567890',
      client_secret: 'client-secret-value',
      grant_type: 'authorization_code',
      code: 'TG-code',
      redirect_uri: OAUTH_CONFIG.redirectUri,
    });
  });

  it('sends test_token only when asked (sandbox credentials)', async () => {
    const { fn, calls } = mockFetch(
      jsonResponse(200, { access_token: 'TEST-x' }),
      jsonResponse(200, { access_token: 'APP_USR-x' }),
    );
    const client = new MercadoPagoOAuthClient(OAUTH_CONFIG, fn);
    await client.exchangeCode('TG-a', { testToken: true });
    await client.exchangeCode('TG-b');
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ test_token: true });
    expect(JSON.parse(String(calls[1].init?.body))).not.toHaveProperty('test_token');
  });

  it('refreshes with refresh_token grant', async () => {
    const { fn, calls } = mockFetch(jsonResponse(200, { access_token: 'new' }));
    await new MercadoPagoOAuthClient(OAUTH_CONFIG, fn).refreshToken('TG-refresh');
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'TG-refresh',
    });
  });

  it('throws a typed error with the MP code but never the secret', async () => {
    const { fn } = mockFetch(
      jsonResponse(400, { error: 'invalid_grant', message: 'echo client-secret-value' }),
    );
    const err = await new MercadoPagoOAuthClient(OAUTH_CONFIG, fn)
      .exchangeCode('bad')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MercadoPagoOAuthError);
    expect((err as MercadoPagoOAuthError).status).toBe(400);
    expect((err as Error).message).toContain('invalid_grant');
    expect((err as Error).message).not.toContain('client-secret-value');
  });

  it('refuses to build without credentials', () => {
    expect(() => new MercadoPagoOAuthClient({ ...OAUTH_CONFIG, clientSecret: '' })).toThrow();
  });
});

describe('computeApplicationFee', () => {
  it.each([
    [50_000, 2_000],
    [10_000, 400],
    [12_345, 493], // 493.8 → piso, nunca más del 4 %
    [1, 0],
  ])('4%% of %i COP is %i', (amount, fee) => {
    expect(computeApplicationFee(amount)).toBe(fee);
  });

  it('honors a custom rate', () => {
    expect(computeApplicationFee(100_000, 0.05)).toBe(5_000);
  });

  it.each([0, -1, 10.5, Number.NaN])('rejects amount %p', (amount) => {
    expect(() => computeApplicationFee(amount)).toThrow();
  });

  it.each([-0.1, 1, Number.NaN])('rejects rate %p', (rate) => {
    expect(() => computeApplicationFee(1000, rate)).toThrow();
  });
});

const PAYMENT_INPUT = {
  sellerAccessToken: 'APP_USR-seller-token',
  amountCop: 50_000,
  cardToken: 'card-tok',
  paymentMethodId: 'master',
  payerEmail: 'buyer@testuser.com',
  externalReference: 'af-key-1',
  idempotencyKey: 'key-1',
};

describe('MercadoPagoSplitClient.createSplitPayment', () => {
  it('POSTs /v1/payments with the seller token and a 4% application_fee', async () => {
    const { fn, calls } = mockFetch(
      jsonResponse(201, {
        id: 9001,
        status: 'approved',
        status_detail: 'accredited',
        collector_id: 3663118866,
        fee_details: [
          { type: 'mercadopago_fee', amount: 1700 },
          { type: 'application_fee', amount: 2000 },
        ],
        transaction_details: { net_received_amount: 46300 },
      }),
    );
    const result = await new MercadoPagoSplitClient(
      { baseUrl: 'https://mp.test' },
      fn,
    ).createSplitPayment(PAYMENT_INPUT);

    expect(calls[0].url).toBe('https://mp.test/v1/payments');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer APP_USR-seller-token');
    expect(headers['X-Idempotency-Key']).toBe('key-1');
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      transaction_amount: 50_000,
      application_fee: 2_000,
      token: 'card-tok',
      payment_method_id: 'master',
      installments: 1,
      payer: { email: 'buyer@testuser.com' },
      external_reference: 'af-key-1',
    });
    expect(result).toEqual({
      paymentId: '9001',
      status: 'approved',
      statusDetail: 'accredited',
      amountCop: 50_000,
      applicationFeeCop: 2_000,
      reportedApplicationFeeCop: 2_000,
      netReceivedCop: 46_300,
      collectorId: '3663118866',
    });
  });

  it('omits application_fee only when asked (diagnostic)', async () => {
    const { fn, calls } = mockFetch(jsonResponse(201, { id: 1, status: 'approved' }));
    const result = await new MercadoPagoSplitClient({}, fn).createSplitPayment({
      ...PAYMENT_INPUT,
      omitApplicationFee: true,
    });
    expect(JSON.parse(String(calls[0].init?.body))).not.toHaveProperty('application_fee');
    expect(result.applicationFeeCop).toBe(0);
  });

  it('refuses to charge without the seller token (no custody)', async () => {
    const { fn } = mockFetch();
    await expect(
      new MercadoPagoSplitClient({}, fn).createSplitPayment({
        ...PAYMENT_INPUT,
        sellerAccessToken: '',
      }),
    ).rejects.toThrow(/ADR-PAG-001/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('refuses to charge without a card token', async () => {
    const { fn } = mockFetch();
    await expect(
      new MercadoPagoSplitClient({}, fn).createSplitPayment({ ...PAYMENT_INPUT, cardToken: '' }),
    ).rejects.toThrow(/tokenized card/);
  });

  it('surfaces the MP error code without echoing the token', async () => {
    const { fn } = mockFetch(
      jsonResponse(400, {
        error: 'bad_request',
        message: 'application_fee not allowed',
        cause: [{ code: 4050, description: 'marketplace not enabled' }],
      }),
    );
    const err = await new MercadoPagoSplitClient({}, fn)
      .createSplitPayment(PAYMENT_INPUT)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MercadoPagoApiError);
    expect((err as Error).message).toContain('application_fee not allowed');
    expect((err as Error).message).toContain('4050:marketplace not enabled');
    expect((err as Error).message).not.toContain('APP_USR-seller-token');
  });
});

describe('webhook signature', () => {
  const SECRET = 'webhook-secret';
  const NOW = new Date('2026-10-29T21:00:00Z');
  const TS = String(Math.floor(NOW.getTime() / 1000));
  const sign = (dataId: string, requestId: string, ts: string) =>
    createHmac('sha256', SECRET)
      .update(webhookManifest(dataId, requestId, ts))
      .digest('hex');
  const SELLER = { accessToken: 'APP_USR-seller-token', userId: '3663118866' };

  it('parses the x-signature header', () => {
    expect(parseSignatureHeader('ts=1704908010, v1=abc')).toEqual({ ts: '1704908010', v1: 'abc' });
    expect(parseSignatureHeader(undefined)).toEqual({});
  });

  it('lowercases alphanumeric ids in the manifest', () => {
    expect(webhookManifest('ABC1', 'req', '1')).toBe('id:abc1;request-id:req;ts:1;');
  });

  it('accepts a valid signature and rejects tampering or bad hex length', () => {
    const v1 = sign('9001', 'req-1', TS);
    expect(verifyWebhookSignature(SECRET, { dataId: '9001', requestId: 'req-1', ts: TS, v1 })).toBe(
      true,
    );
    expect(verifyWebhookSignature(SECRET, { dataId: '9002', requestId: 'req-1', ts: TS, v1 })).toBe(
      false,
    );
    expect(
      verifyWebhookSignature('other', { dataId: '9001', requestId: 'req-1', ts: TS, v1 }),
    ).toBe(false);
    expect(
      verifyWebhookSignature(SECRET, { dataId: '9001', requestId: 'req-1', ts: TS, v1: 'ab' }),
    ).toBe(false);
  });

  it('verifies and reads the payment with the seller token', async () => {
    const { fn, calls } = mockFetch(
      jsonResponse(200, {
        id: 9001,
        status: 'approved',
        collector_id: 3663118866,
        external_reference: 'af-key-1',
      }),
    );
    const out = await new MercadoPagoSplitClient(
      { webhookSecret: SECRET, baseUrl: 'https://mp.test' },
      fn,
    ).verifyWebhook({
      signature: `ts=${TS},v1=${sign('9001', 'req-1', TS)}`,
      requestId: 'req-1',
      dataId: '9001',
      seller: SELLER,
      now: NOW,
    });
    expect(out.eventId).toBe('9001-approved');
    expect(calls[0].url).toBe('https://mp.test/v1/payments/9001');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer APP_USR-seller-token',
    );
  });

  it('accepts a millisecond ts', async () => {
    const tsMs = String(NOW.getTime());
    const { fn } = mockFetch(
      jsonResponse(200, {
        id: 1,
        status: 'approved',
        collector_id: 3663118866,
        external_reference: 'r',
      }),
    );
    await expect(
      new MercadoPagoSplitClient({ webhookSecret: SECRET }, fn).verifyWebhook({
        signature: `ts=${tsMs},v1=${sign('1', 'r', tsMs)}`,
        requestId: 'r',
        dataId: '1',
        seller: SELLER,
        now: NOW,
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['bad signature', { signature: `ts=${TS},v1=${'0'.repeat(64)}` }, /mismatch/],
    ['missing request id', { requestId: undefined }, /missing/],
    ['stale ts', { now: new Date(NOW.getTime() + 10 * 60_000) }, /stale/],
  ])('rejects %s without calling MP', async (_label, override, error) => {
    const { fn } = mockFetch();
    await expect(
      new MercadoPagoSplitClient({ webhookSecret: SECRET }, fn).verifyWebhook({
        signature: `ts=${TS},v1=${sign('9001', 'req-1', TS)}`,
        requestId: 'req-1',
        dataId: '9001',
        seller: SELLER,
        now: NOW,
        ...override,
      }),
    ).rejects.toThrow(error);
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects when no secret is configured', async () => {
    await expect(
      new MercadoPagoSplitClient({}).verifyWebhook({
        signature: `ts=${TS},v1=${sign('9001', 'req-1', TS)}`,
        requestId: 'req-1',
        dataId: '9001',
        seller: SELLER,
        now: NOW,
      }),
    ).rejects.toThrow(/missing/);
  });

  it("rejects a payment from another seller's account", async () => {
    const { fn } = mockFetch(
      jsonResponse(200, {
        id: 9001,
        status: 'approved',
        collector_id: 111,
        external_reference: 'af',
      }),
    );
    await expect(
      new MercadoPagoSplitClient({ webhookSecret: SECRET }, fn).verifyWebhook({
        signature: `ts=${TS},v1=${sign('9001', 'req-1', TS)}`,
        requestId: 'req-1',
        dataId: '9001',
        seller: SELLER,
        now: NOW,
      }),
    ).rejects.toThrow(/another account/);
  });
});
