import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { MercadoPagoBillingClient } from './mercadopago-billing.client';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    MERCADOPAGO_BASE_URL: 'https://api.mp.test',
    MERCADOPAGO_PLATFORM_ACCESS_TOKEN: 'APP_USR-123-platform-token',
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

const INPUT = {
  reason: 'AdoptaFácil · Plan Crece (mensual)',
  externalReference: 'plan:org:crece',
  payerEmail: 'dueno@refugio.test',
  amountCop: 59_500,
  backUrl: 'https://app.test/organizacion/plan?pago=mercadopago',
  idempotencyKey: 'k1',
};

describe('MercadoPagoBillingClient (plans, AdoptaFácil account)', () => {
  it('creates a pending monthly COP subscription with the platform token', async () => {
    const fetchFn = jest.fn(async () =>
      json({
        id: 'pre123',
        init_point: 'https://www.mercadopago.com.co/subscriptions/checkout?preapproval_id=pre123',
      }),
    );
    const client = new MercadoPagoBillingClient(makeConfig(), fetchFn);
    const out = await client.createMonthlySubscription(INPUT);
    expect(out).toEqual({
      id: 'pre123',
      checkoutUrl: 'https://www.mercadopago.com.co/subscriptions/checkout?preapproval_id=pre123',
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.mp.test/preapproval');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer APP_USR-123-platform-token',
    );
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      status: 'pending',
      payer_email: 'dueno@refugio.test',
      back_url: INPUT.backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 59_500,
        currency_id: 'COP',
      },
    });
  });

  it('in the sandbox it opens the sandbox link and bills the TEST BUYER email', async () => {
    const fetchFn = jest.fn(async () =>
      json({
        id: 'pre9',
        init_point: 'https://www.mercadopago.com.co/subscriptions/checkout?preapproval_id=pre9',
        sandbox_init_point:
          'https://sandbox.mercadopago.com.co/subscriptions/checkout?preapproval_id=pre9',
      }),
    );
    const client = new MercadoPagoBillingClient(
      makeConfig({
        MERCADOPAGO_TEST: true,
        MERCADOPAGO_TEST_PAYER_EMAIL: 'test_user_1@testuser.com',
      }),
      fetchFn,
    );
    const out = await client.createMonthlySubscription(INPUT);
    expect(out.checkoutUrl).toContain('sandbox.mercadopago.com.co');
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).payer_email).toBe('test_user_1@testuser.com');
  });

  it('ignores MERCADOPAGO_TEST_PAYER_EMAIL when the sandbox is off', async () => {
    const fetchFn = jest.fn(async () =>
      json({
        id: 'pre9',
        init_point: 'https://www.mercadopago.com.co/subscriptions/checkout?preapproval_id=pre9',
      }),
    );
    const client = new MercadoPagoBillingClient(
      makeConfig({ MERCADOPAGO_TEST_PAYER_EMAIL: 'test_user_1@testuser.com' }),
      fetchFn,
    );
    await client.createMonthlySubscription(INPUT);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).payer_email).toBe('dueno@refugio.test');
  });

  it("keeps Mercado Pago's reason when the subscription is refused, never the token", async () => {
    const fetchFn = jest.fn(async () =>
      json(
        {
          message: 'Cannot operate between different countries',
          error: 'bad_request',
          cause: [{ description: 'payer_email must be a test user' }],
        },
        400,
      ),
    );
    const client = new MercadoPagoBillingClient(makeConfig(), fetchFn);
    const error = await client.createMonthlySubscription(INPUT).catch((e: Error) => e);
    expect((error as Error).message).toContain('(400:');
    expect((error as Error).message).toContain('Cannot operate between different countries');
    expect((error as Error).message).toContain('payer_email must be a test user');
    expect((error as Error).message).not.toContain('platform-token');
  });

  it('refuses a response whose link is not a Mercado Pago checkout', async () => {
    const fetchFn = jest.fn(async () => json({ id: 'pre1', init_point: 'https://evil.test/pay' }));
    const client = new MercadoPagoBillingClient(makeConfig(), fetchFn);
    await expect(client.createMonthlySubscription(INPUT)).rejects.toThrow('no usable checkout');
  });

  it('reads an authorized payment: the charge status is the payment status', async () => {
    const fetchFn = jest.fn(async () =>
      json({
        id: 777,
        preapproval_id: 'pre123',
        status: 'processed',
        payment: { id: 55, status: 'approved' },
        transaction_amount: 59500,
        currency_id: 'COP',
        debit_date: '2026-11-12T15:00:00.000-05:00',
      }),
    );
    const client = new MercadoPagoBillingClient(makeConfig(), fetchFn);
    const charge = await client.getAuthorizedPayment('777');
    expect(charge).toMatchObject({
      id: '777',
      preapprovalId: 'pre123',
      paymentStatus: 'approved',
      amount: 59_500,
      currency: 'COP',
    });
    expect(charge.chargedAt?.toISOString()).toBe('2026-11-12T20:00:00.000Z');
  });
});
