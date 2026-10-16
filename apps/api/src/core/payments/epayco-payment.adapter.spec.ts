import type { ConfigService } from '@nestjs/config';
import {
  computeBreakdown,
  DIRECT_COLLECTION_RATES,
  type CreateCollectionInput,
  type EpaycoCollectorCredentials,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import {
  EPAYCO_INVOICE_MAX_LENGTH,
  EpaycoPaymentAdapter,
  epaycoConfirmationSignature,
  epaycoInvoiceFor,
} from './epayco-payment.adapter';

const ORG: EpaycoCollectorCredentials = {
  custId: '123456',
  pKey: 'org-p-key-secret',
  publicKey: 'org-public-key-abcd',
  privateKey: 'org-private-key-secret',
};

const PLATFORM = {
  EPAYCO_PLATFORM_CUST_ID: '999000',
  EPAYCO_PLATFORM_P_KEY: 'platform-p-key-secret',
  EPAYCO_PLATFORM_PUBLIC_KEY: 'platform-public',
  EPAYCO_PLATFORM_PRIVATE_KEY: 'platform-private-secret',
};

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    EPAYCO_APIFY_BASE_URL: 'https://apify.test',
    EPAYCO_SECURE_BASE_URL: 'https://secure.test',
    STORAGE_PUBLIC_BASE_URL: 'https://api.adoptafacil.test',
    WEB_BASE_URL: 'https://app.adoptafacil.test',
    EPAYCO_TEST: true,
    EPAYCO_COLLECTION_MODE: 'direct_to_org',
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

/** Mocked network: login → token, session → sessionId, read-back → `tx`. */
function makeFetch(tx: Record<string, unknown> = {}) {
  return jest.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/login')) return json({ token: 'apify-token' });
    if (u.endsWith('/payment/session/create')) {
      return json({ success: true, data: { sessionId: 'sess-1' } });
    }
    if (u.includes('/validation/v1/reference/')) return json({ success: true, data: tx });
    return json({}, 404);
  });
}

const INPUT: CreateCollectionInput = {
  intendedAmount: 50_000,
  currency: 'COP',
  concept: { kind: 'organization', id: 'org-uuid-1' },
  commissionPayer: 'donor',
  payer: { email: 'donante@test.local', fullName: 'Ana' },
  idempotencyKey: 'idem-key-1',
  epaycoCollector: ORG,
};

function bodyOf(fetchFn: jest.Mock, suffix: string): Record<string, unknown> {
  const call = fetchFn.mock.calls.find(([url]) => String(url).endsWith(suffix));
  return JSON.parse(String(call![1]!.body));
}

function headersOf(fetchFn: jest.Mock, suffix: string): Record<string, string> {
  const call = fetchFn.mock.calls.find(([url]) => String(url).endsWith(suffix));
  return call![1]!.headers as Record<string, string>;
}

describe('EpaycoPaymentAdapter.createCollection — direct_to_org (ADR-PAG-001)', () => {
  it("logs in with the ORG's keys and creates a session with zero platform fee", async () => {
    const fetchFn = makeFetch();
    const adapter = new EpaycoPaymentAdapter(makeConfig(), fetchFn);

    const result = await adapter.createCollection(INPUT);

    const expected = computeBreakdown(50_000, 'donor', DIRECT_COLLECTION_RATES);
    expect(result.breakdown).toEqual(expected);
    expect(result.breakdown.platformFee).toBe(0);
    expect(result.status).toBe('pending');
    expect(result.checkoutSessionId).toBe('sess-1');
    expect(result.collectionId).toBe(epaycoInvoiceFor(ORG.custId, 'idem-key-1'));

    const basic = Buffer.from(`${ORG.publicKey}:${ORG.privateKey}`).toString('base64');
    expect(headersOf(fetchFn, '/login').Authorization).toBe(`Basic ${basic}`);
    expect(headersOf(fetchFn, '/payment/session/create').Authorization).toBe('Bearer apify-token');

    const body = bodyOf(fetchFn, '/payment/session/create');
    expect(body).toMatchObject({
      checkout_version: '2',
      currency: 'COP',
      amount: expected.amountCharged,
      invoice: result.collectionId,
      country: 'CO',
      lang: 'ES',
      test: true,
      method: 'POST',
      confirmation: 'https://api.adoptafacil.test/donations/webhook',
      extras: { extra1: 'org-uuid-1', extra2: 'organization' },
      billing: { email: 'donante@test.local', name: 'Ana' },
    });
    expect(String(body.response)).toBe(
      `https://app.adoptafacil.test/donaciones/resultado?reference=${result.collectionId}`,
    );
    expect(body.splitPayment).toBeUndefined();
    // No secret ever travels in the session body.
    expect(JSON.stringify(body)).not.toContain(ORG.pKey);
    expect(JSON.stringify(body)).not.toContain(ORG.privateKey);
  });

  it('the invoice is stable, short and different per merchant', () => {
    const a = epaycoInvoiceFor('1', 'same-key');
    expect(a).toBe(epaycoInvoiceFor('1', 'same-key'));
    expect(a).not.toBe(epaycoInvoiceFor('2', 'same-key'));
    expect(a.length).toBeLessThanOrEqual(EPAYCO_INVOICE_MAX_LENGTH);
    expect(a).toMatch(/^af-[0-9a-f]+$/);
  });

  it('refuses to charge without the org keys (custody, ADR-PAG-001), with no network', async () => {
    const fetchFn = makeFetch();
    const adapter = new EpaycoPaymentAdapter(makeConfig(), fetchFn);
    await expect(
      adapter.createCollection({ ...INPUT, epaycoCollector: undefined }),
    ).rejects.toThrow(/custody.*ADR-PAG-001/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails closed when login returns no token', async () => {
    const fetchFn = jest.fn(async () => json({ data: {} }));
    const adapter = new EpaycoPaymentAdapter(makeConfig(), fetchFn);
    await expect(adapter.createCollection(INPUT)).rejects.toThrow(/no token/);
  });

  it('accepts the token under data.token', async () => {
    const fetchFn = jest.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/login')
        ? json({ data: { token: 't2' } })
        : json({ data: { sessionId: 's2' } }),
    );
    const adapter = new EpaycoPaymentAdapter(makeConfig(), fetchFn);
    await expect(adapter.createCollection(INPUT)).resolves.toMatchObject({
      checkoutSessionId: 's2',
    });
  });

  it('error messages never contain the keys', async () => {
    const fetchFn = jest.fn(async () => json({ message: 'bad' }, 401));
    const adapter = new EpaycoPaymentAdapter(makeConfig(), fetchFn);
    const error = await adapter.createCollection(INPUT).catch((e: Error) => e);
    expect(String(error)).toMatch(/login failed \(401\)/);
    expect(String(error)).not.toContain(ORG.privateKey);
  });
});

describe('EpaycoPaymentAdapter.createCollection — platform_split (OFF by default)', () => {
  it('refuses split without the written approval ref (planCollection)', async () => {
    const fetchFn = makeFetch();
    const adapter = new EpaycoPaymentAdapter(
      makeConfig({
        EPAYCO_COLLECTION_MODE: 'platform_split',
        EPAYCO_SPLIT_FEE_RATE: 0.04,
        ...PLATFORM,
      }),
      fetchFn,
    );
    await expect(adapter.createCollection(INPUT)).rejects.toThrow(/split_without_written_approval/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses split with an invalid fee rate', async () => {
    const adapter = new EpaycoPaymentAdapter(
      makeConfig({
        EPAYCO_COLLECTION_MODE: 'platform_split',
        EPAYCO_SPLIT_APPROVAL_REF: 'ticket-1',
        ...PLATFORM,
      }),
      makeFetch(),
    );
    await expect(adapter.createCollection(INPUT)).rejects.toThrow(/invalid_fee_rate/);
  });

  it('when approved: platform keys create the session and the org is the split receiver', async () => {
    const fetchFn = makeFetch();
    const adapter = new EpaycoPaymentAdapter(
      makeConfig({
        EPAYCO_COLLECTION_MODE: 'platform_split',
        EPAYCO_SPLIT_APPROVAL_REF: 'ePayco ticket 42',
        EPAYCO_SPLIT_FEE_RATE: 0.04,
        ...PLATFORM,
      }),
      fetchFn,
    );
    const result = await adapter.createCollection({ ...INPUT, commissionPayer: 'organization' });

    expect(result.breakdown).toEqual(
      computeBreakdown(50_000, 'organization', { platformRate: 0.04 }),
    );
    const basic = Buffer.from('platform-public:platform-private-secret').toString('base64');
    expect(headersOf(fetchFn, '/login').Authorization).toBe(`Basic ${basic}`);
    const body = bodyOf(fetchFn, '/payment/session/create');
    expect(body.splitPayment).toEqual({
      type: 'percentage',
      receivers: [{ merchantId: ORG.custId, amount: '96', taxBase: '0', tax: '0', fee: '4' }],
    });
  });
});

describe('EpaycoPaymentAdapter.verifyAndNormalizeWebhook', () => {
  const invoice = epaycoInvoiceFor(ORG.custId, 'idem-key-1');
  const posted = {
    x_ref_payco: '987654',
    x_transaction_id: 'tx-555',
    x_amount: '52300',
    x_currency_code: 'COP',
    x_id_invoice: invoice,
    x_cust_id_cliente: ORG.custId,
    x_cod_transaction_state: '1',
  };
  const signed = (body: typeof posted, pKey = ORG.pKey, custId = ORG.custId) => ({
    ...body,
    x_signature: epaycoConfirmationSignature(custId, pKey, body),
  });
  const readBack = (overrides: Record<string, unknown> = {}) => ({
    x_ref_payco: '987654',
    x_cod_transaction_state: 1,
    x_amount: '52300.00',
    x_currency_code: 'COP',
    x_id_invoice: invoice,
    x_cust_id_cliente: ORG.custId,
    ...overrides,
  });

  it('accepts a valid signature and normalizes from the READ-BACK', async () => {
    const fetchFn = makeFetch(readBack());
    const adapter = new EpaycoPaymentAdapter(makeConfig(), fetchFn);
    const event = await adapter.verifyAndNormalizeWebhook(signed(posted), '', {
      epaycoCollector: ORG,
    });
    expect(event).toEqual({
      eventId: '987654',
      collectionId: invoice,
      status: 'approved',
      dedupKey: 'epayco:987654:approved',
      amountCharged: 52_300,
      currency: 'COP',
      receiverAccountId: ORG.custId,
    });
    expect(String(fetchFn.mock.calls[0][0])).toBe(
      'https://secure.test/validation/v1/reference/987654',
    );
  });

  it('accepts a form-urlencoded raw string body too', async () => {
    const adapter = new EpaycoPaymentAdapter(makeConfig(), makeFetch(readBack()));
    const raw = new URLSearchParams(signed(posted)).toString();
    await expect(
      adapter.verifyAndNormalizeWebhook(raw, '', { epaycoCollector: ORG }),
    ).resolves.toMatchObject({ status: 'approved' });
  });

  it('rejects an invalid signature without reading back', async () => {
    const fetchFn = makeFetch(readBack());
    const adapter = new EpaycoPaymentAdapter(makeConfig(), fetchFn);
    await expect(
      adapter.verifyAndNormalizeWebhook(signed(posted, 'wrong-p-key'), '', {
        epaycoCollector: ORG,
      }),
    ).rejects.toThrow(/signature mismatch/);
    await expect(
      adapter.verifyAndNormalizeWebhook({ ...signed(posted), x_signature: 'abc' }, '', {
        epaycoCollector: ORG,
      }),
    ).rejects.toThrow(/signature mismatch/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects a tampered amount (signature covers x_amount)', async () => {
    const adapter = new EpaycoPaymentAdapter(makeConfig(), makeFetch(readBack()));
    await expect(
      adapter.verifyAndNormalizeWebhook({ ...signed(posted), x_amount: '1000' }, '', {
        epaycoCollector: ORG,
      }),
    ).rejects.toThrow(/signature mismatch/);
  });

  it('rejects a confirmation of another merchant (wrong cust id)', async () => {
    const other = { ...posted, x_cust_id_cliente: '555' };
    const adapter = new EpaycoPaymentAdapter(makeConfig(), makeFetch(readBack()));
    await expect(
      adapter.verifyAndNormalizeWebhook(signed(other, ORG.pKey, '555'), '', {
        epaycoCollector: ORG,
      }),
    ).rejects.toThrow(/another merchant/);
  });

  it('rejects when the read-back names another merchant or invoice', async () => {
    const a = new EpaycoPaymentAdapter(
      makeConfig(),
      makeFetch(readBack({ x_cust_id_cliente: '555' })),
    );
    await expect(
      a.verifyAndNormalizeWebhook(signed(posted), '', { epaycoCollector: ORG }),
    ).rejects.toThrow(/read-back merchant/);
    const b = new EpaycoPaymentAdapter(makeConfig(), makeFetch(readBack({ x_id_invoice: 'af-x' })));
    await expect(
      b.verifyAndNormalizeWebhook(signed(posted), '', { epaycoCollector: ORG }),
    ).rejects.toThrow(/invoice differs/);
  });

  it('uses the read-back amount (mismatch surfaces to the caller, fraction ⇒ NaN)', async () => {
    const a = new EpaycoPaymentAdapter(makeConfig(), makeFetch(readBack({ x_amount: '1000' })));
    const event = await a.verifyAndNormalizeWebhook(signed(posted), '', { epaycoCollector: ORG });
    expect(event.amountCharged).toBe(1000);
    const b = new EpaycoPaymentAdapter(makeConfig(), makeFetch(readBack({ x_amount: '52300.50' })));
    const fractional = await b.verifyAndNormalizeWebhook(signed(posted), '', {
      epaycoCollector: ORG,
    });
    expect(Number.isNaN(fractional.amountCharged)).toBe(true);
  });

  it.each([
    ['2', 'declined'],
    ['3', 'pending'],
    ['4', 'error'],
    ['6', 'voided'],
    ['10', 'declined'],
    ['99', 'pending'],
  ])('maps state %s to %s (from the read-back)', async (code, status) => {
    const adapter = new EpaycoPaymentAdapter(
      makeConfig(),
      makeFetch(readBack({ x_cod_transaction_state: code })),
    );
    const event = await adapter.verifyAndNormalizeWebhook(signed(posted), '', {
      epaycoCollector: ORG,
    });
    expect(event.status).toBe(status);
    expect(event.dedupKey).toBe(`epayco:987654:${status}`);
  });

  it('rejects without the org keys, missing fields or a failed read-back', async () => {
    const adapter = new EpaycoPaymentAdapter(
      makeConfig(),
      jest.fn(async () => json({}, 500)),
    );
    await expect(adapter.verifyAndNormalizeWebhook(signed(posted), '', {})).rejects.toThrow(
      /no connected organization/,
    );
    await expect(
      adapter.verifyAndNormalizeWebhook({ x_ref_payco: '1' }, '', { epaycoCollector: ORG }),
    ).rejects.toThrow(/missing confirmation fields/);
    await expect(
      adapter.verifyAndNormalizeWebhook(signed(posted), '', { epaycoCollector: ORG }),
    ).rejects.toThrow(/read-back failed \(500\)/);
  });

  it('split mode verifies with the PLATFORM keys', async () => {
    const platformPosted = { ...posted, x_cust_id_cliente: PLATFORM.EPAYCO_PLATFORM_CUST_ID };
    const adapter = new EpaycoPaymentAdapter(
      makeConfig({
        EPAYCO_COLLECTION_MODE: 'platform_split',
        EPAYCO_SPLIT_APPROVAL_REF: 'ref',
        EPAYCO_SPLIT_FEE_RATE: 0.04,
        ...PLATFORM,
      }),
      makeFetch(readBack({ x_cust_id_cliente: PLATFORM.EPAYCO_PLATFORM_CUST_ID })),
    );
    const event = await adapter.verifyAndNormalizeWebhook(
      signed(platformPosted, PLATFORM.EPAYCO_PLATFORM_P_KEY, PLATFORM.EPAYCO_PLATFORM_CUST_ID),
      '',
      { epaycoCollector: ORG },
    );
    expect(event.receiverAccountId).toBe(ORG.custId);
    await expect(
      adapter.verifyAndNormalizeWebhook(signed(posted), '', { epaycoCollector: ORG }),
    ).rejects.toThrow(/another merchant/);
  });
});

describe('EpaycoPaymentAdapter — no custody, status lookup', () => {
  const adapter = new EpaycoPaymentAdapter(
    makeConfig(),
    makeFetch({ x_cod_transaction_state: '1' }),
  );

  it('createPayout / payout webhook are not supported', async () => {
    await expect(
      adapter.createPayout({
        beneficiaryOrgId: 'o',
        amount: 1,
        idempotencyKey: 'k',
        bankAccount: {
          bankCode: '1',
          accountType: 'savings',
          accountNumber: '1234',
          accountHolderName: 'x',
          accountHolderDocument: '1234',
        },
      }),
    ).rejects.toThrow(/never holds donations/);
    await expect(adapter.verifyAndNormalizePayoutWebhook({}, '')).rejects.toThrow(/no payouts/);
  });

  it('getCollectionStatus reads back by ref_payco and refuses our own reference', async () => {
    await expect(adapter.getCollectionStatus('987654')).resolves.toBe('approved');
    await expect(adapter.getCollectionStatus('af-abc')).rejects.toThrow(/ref_payco/);
  });
});
