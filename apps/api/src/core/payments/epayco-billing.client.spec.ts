import {
  buildEpaycoPlan,
  EpaycoBillingClient,
  EpaycoBillingError,
  EPAYCO_RECURRING_PATHS,
  epaycoPlanId,
} from './epayco-billing.client';

const CONFIG = { publicKey: 'pub-test', privateKey: 'priv-test', test: true };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildEpaycoPlan', () => {
  it('maps a paid plan to an ePayco plan with IVA included and a stable id', () => {
    expect(buildEpaycoPlan('crece', 'month', 0.19)).toEqual({
      id_plan: 'af-crece-month',
      name: 'AdoptaFácil Crece',
      description: 'Plan Crece de AdoptaFácil (mensual)',
      amount: 46_410,
      currency: 'cop',
      interval: 'month',
      interval_count: 1,
      trial_days: 0,
    });
    expect(epaycoPlanId('pro', 'year')).toBe('af-pro-year');
  });

  it('refuses the free plan and an invalid IVA rate', () => {
    expect(() => buildEpaycoPlan('free', 'month', 0.19)).toThrow(/no tiene precio/);
    expect(() => buildEpaycoPlan('crece', 'month', 1)).toThrow(/IVA/);
  });
});

describe('EpaycoBillingClient', () => {
  it('logs in with the PLATFORM keys and sends the bearer token on each call', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ bearer_token: 'tok-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ status: true, id: 'sub-9', data: { status: 'active' } }),
      );
    const client = new EpaycoBillingClient(CONFIG, fetchMock as unknown as typeof fetch);

    const result = await client.createSubscription({
      planId: 'af-crece-month',
      customerId: 'cus-1',
      tokenCard: 'tok-card',
      docType: 'NIT',
      docNumber: '900123456',
    });

    expect(result).toEqual({ subscriptionId: 'sub-9', status: 'active' });
    const [loginUrl, loginInit] = fetchMock.mock.calls[0];
    expect(loginUrl).toBe(`https://api.secure.payco.co${EPAYCO_RECURRING_PATHS.login}`);
    expect(JSON.parse(loginInit.body)).toEqual({
      public_key: 'pub-test',
      private_key: 'priv-test',
    });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`https://api.secure.payco.co${EPAYCO_RECURRING_PATHS.createSubscription}`);
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(init.body)).toEqual({
      id_plan: 'af-crece-month',
      customer: 'cus-1',
      token_card: 'tok-card',
      doc_type: 'NIT',
      doc_number: '900123456',
      test: true,
    });
  });

  it('treats a 200 with status:false as a rejection', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ bearer_token: 'tok-1' }))
      .mockResolvedValueOnce(jsonResponse({ status: false, message: 'plan exists' }));
    const client = new EpaycoBillingClient(CONFIG, fetchMock as unknown as typeof fetch);

    await expect(client.createPlan(buildEpaycoPlan('pro', 'month', 0.19))).rejects.toBeInstanceOf(
      EpaycoBillingError,
    );
  });

  it('fails closed when login returns no token', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(jsonResponse({ status: true }));
    const client = new EpaycoBillingClient(CONFIG, fetchMock as unknown as typeof fetch);

    await expect(client.cancelSubscription('sub-9')).rejects.toThrow(/token/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses to start without platform keys', () => {
    expect(() => new EpaycoBillingClient({ ...CONFIG, privateKey: '' })).toThrow(/llaves/);
  });
});
