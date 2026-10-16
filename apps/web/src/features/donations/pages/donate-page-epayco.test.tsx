import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';
import { loadEpaycoCheckout } from '../../payments/lib/load-epayco-checkout';

/**
 * ADR-PAG-002 — `/donaciones` con `VITE_PAYMENT_PROVIDER=epayco`: sin Card
 * Payment Brick; se crea la donación y se abre el checkout de ePayco con la
 * sesión que devuelve la API. El cargador del script se MOCKEA: ningún test
 * descarga el script real de ePayco.
 */
vi.mock('../../payments/lib/load-epayco-checkout', () => ({
  loadEpaycoCheckout: vi.fn(),
}));
// El Brick de Mercado Pago no debe montarse en este modo; si lo hiciera, el
// mock lo delata sin cargar el SDK real.
vi.mock('../../payments', () => ({
  CardPaymentBrick: () => <div data-testid="mp-card-brick" />,
}));

const ROUTE = '/donaciones?organizationId=org-1&organizationName=Refugio%20Patitas';

function personSession() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'donor-1',
        name: 'Donante Tester',
        email: 'donante@example.test',
        roles: [],
        organizationId: 'org-donor-1',
        accountType: 'person' as const,
      },
    },
  };
}

const DONATION = {
  id: 'don-1',
  organizationId: 'org-1',
  status: 'pending',
  intendedAmount: 50000,
  amountCharged: 50000,
  currency: 'COP',
  checkoutSessionId: 'sess-epayco-123',
  checkoutTest: true,
};

function stubFetch(donation: unknown = DONATION) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const body = url.includes('/availability')
        ? { canReceiveDonations: true }
        : url.endsWith('/donations') && init?.method === 'POST'
          ? donation
          : [];
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => body,
      });
    }),
  );
  return calls;
}

async function fillAndDonate() {
  fireEvent.change(await screen.findByPlaceholderText('50000'), { target: { value: '50000' } });
  fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));
}

beforeEach(() => {
  vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.mocked(loadEpaycoCheckout).mockReset();
});

describe('DonatePage — checkout de ePayco (VITE_PAYMENT_PROVIDER=epayco)', () => {
  it('creates the donation WITHOUT card data and opens ePayco onpage with the returned session', async () => {
    const open = vi.fn();
    const configure = vi.fn(() => ({ open }));
    vi.mocked(loadEpaycoCheckout).mockResolvedValue({ checkout: { configure } });
    const calls = stubFetch();
    renderShell({ route: ROUTE, ...personSession() });

    await fillAndDonate();

    await waitFor(() =>
      expect(configure).toHaveBeenCalledWith({
        sessionId: 'sess-epayco-123',
        type: 'onpage',
        test: true,
      }),
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('mp-card-brick')).not.toBeInTheDocument();
    expect(await screen.findByText('Completa tu pago en ePayco')).toBeInTheDocument();

    const post = calls.find((c) => c.url.endsWith('/donations') && c.init?.method === 'POST');
    const body = JSON.parse(String(post?.init?.body));
    expect(body).toMatchObject({ organizationId: 'org-1', intendedAmount: 50000 });
    expect(body.cardToken).toBeUndefined();
    expect(body.paymentMethodId).toBeUndefined();
  });

  it('passes test=false when the session is not a sandbox one', async () => {
    const configure = vi.fn(() => ({ open: vi.fn() }));
    vi.mocked(loadEpaycoCheckout).mockResolvedValue({ checkout: { configure } });
    stubFetch({ ...DONATION, checkoutTest: undefined });
    renderShell({ route: ROUTE, ...personSession() });

    await fillAndDonate();

    await waitFor(() =>
      expect(configure).toHaveBeenCalledWith(expect.objectContaining({ test: false })),
    );
  });

  it('shows a clear Spanish error (and a retry) when the ePayco script cannot load', async () => {
    vi.mocked(loadEpaycoCheckout).mockRejectedValue(new Error('No se pudo cargar'));
    stubFetch();
    renderShell({ route: ROUTE, ...personSession() });

    await fillAndDonate();

    expect(await screen.findByTestId('epayco-checkout-error')).toHaveTextContent(
      'No pudimos cargar la pasarela de pagos de ePayco',
    );

    const open = vi.fn();
    vi.mocked(loadEpaycoCheckout).mockResolvedValue({
      checkout: { configure: () => ({ open }) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar abrir el pago' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  });

  it('keeps the Mercado Pago Brick step when VITE_PAYMENT_PROVIDER is not epayco', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', '');
    stubFetch();
    renderShell({ route: ROUTE, ...personSession() });

    await fillAndDonate();

    expect(await screen.findByTestId('mp-card-brick')).toBeInTheDocument();
    expect(loadEpaycoCheckout).not.toHaveBeenCalled();
  });
});
