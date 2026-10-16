import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * Pestaña "Medios de pago" (ADR-PAG-002): "QR de donaciones" de la
 * organización y "Conectar ePayco" (con VITE_PAYMENT_PROVIDER=epayco, en lugar
 * de Mercado Pago). Mismo stub de fetch que `org-profile-page-mercadopago.test.tsx`.
 */
function ownerSession() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Dueña',
        email: 'duena@patitas.org',
        roles: [Role.Owner],
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

const BASE_ORG = { id: 'org-1', name: 'Refugio Patitas', slug: 'patitas-felices' };

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown };

function stubFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const { status = 200, body } = handler(url, init);
      return Promise.resolve({
        ok: status < 400,
        status,
        headers: { get: () => null },
        json: async () => body,
        blob: async () => new Blob(),
      });
    }),
  );
  return calls;
}

async function openPaymentsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Medios de pago' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Medios de pago — QR de donaciones', () => {
  it('shows the QR, the stable /o/:slug/donar URL and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    stubFetch((url) =>
      url.includes('/org/mercadopago/status') ? { body: { connected: false } } : { body: BASE_ORG },
    );
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    const card = await screen.findByTestId('donation-qr-card');
    const expected = `${window.location.origin}/o/patitas-felices/donar`;
    expect(within(card).getByTestId('donation-qr-url')).toHaveTextContent(expected);
    expect(await within(card).findByTestId('donation-qr-image')).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/png/),
    );
    expect(await within(card).findByTestId('donation-qr-download')).toHaveAttribute(
      'download',
      'qr-donaciones-patitas-felices.png',
    );
    expect(within(card).getByText(/Nequi, Daviplata/)).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected));
    expect(await screen.findByText('Enlace copiado')).toBeInTheDocument();
  });

  it('uses the real subdomain URL when the org has one and the portal domain is configured', async () => {
    vi.stubEnv('VITE_PORTAL_BASE_DOMAIN', 'adoptafacil.org');
    stubFetch((url) =>
      url.includes('/org/mercadopago/status')
        ? { body: { connected: false } }
        : { body: { ...BASE_ORG, subdomain: 'patitas' } },
    );
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByTestId('donation-qr-url')).toHaveTextContent(
      'https://patitas.adoptafacil.org/donar',
    );
  });

  it('shows an empty state that takes the manager to set the portal link when there is no slug', async () => {
    stubFetch((url) =>
      url.includes('/org/mercadopago/status')
        ? { body: { connected: false } }
        : { body: { id: 'org-1', name: 'Refugio Patitas' } },
    );
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByTestId('donation-qr-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('donation-qr-url')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Definir el enlace del portal' }));
    expect(screen.getByRole('tab', { name: 'Datos institucionales' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('Medios de pago — Conectar ePayco (VITE_PAYMENT_PROVIDER=epayco)', () => {
  function fillKeys() {
    fireEvent.change(screen.getByLabelText('P_CUST_ID_CLIENTE'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('P_KEY'), { target: { value: 'pkey-secreta' } });
    fireEvent.change(screen.getByLabelText('PUBLIC_KEY'), { target: { value: 'pub-abcd1234' } });
    fireEvent.change(screen.getByLabelText('PRIVATE_KEY'), { target: { value: 'priv-secreta' } });
  }

  it('shows the ePayco card instead of Mercado Pago, with secret inputs masked', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    stubFetch((url) =>
      url.includes('/org/epayco/status') ? { body: { connected: false } } : { body: BASE_ORG },
    );
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByRole('heading', { name: 'ePayco' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mercado Pago' })).not.toBeInTheDocument();
    expect(await screen.findByText(/Integraciones → Llaves API/)).toBeInTheDocument();
    expect(screen.getByText(/persona natural/)).toBeInTheDocument();
    for (const label of ['P_KEY', 'PRIVATE_KEY']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password');
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'off');
    }
  });

  it('PUTs the four keys and then shows the connected view (custId, …hint, Colombia time)', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    let connected = false;
    const calls = stubFetch((url, init) => {
      if (url.includes('/org/epayco/connect') && init?.method === 'PUT') {
        connected = true;
        return { body: { ok: true } };
      }
      if (url.includes('/org/epayco/status')) {
        return {
          body: connected
            ? {
                connected: true,
                custId: '123456',
                publicKeyHint: '1234',
                connectedAt: '2026-10-15T03:30:00.000Z',
              }
            : { connected: false },
        };
      }
      return { body: BASE_ORG };
    });
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    await screen.findByLabelText('P_KEY');
    fillKeys();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar ePayco' }));

    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/org/epayco/connect'))).toBe(true),
    );
    const put = calls.find((c) => c.url.endsWith('/org/epayco/connect'));
    expect(put?.init?.method).toBe('PUT');
    expect(JSON.parse(String(put?.init?.body))).toEqual({
      custId: '123456',
      pKey: 'pkey-secreta',
      publicKey: 'pub-abcd1234',
      privateKey: 'priv-secreta',
    });

    expect(await screen.findByText('Cuenta conectada')).toBeInTheDocument();
    expect(screen.getByTestId('epayco-cust-id')).toHaveTextContent('123456');
    expect(screen.getByTestId('epayco-key-hint')).toHaveTextContent('…1234');
    // 03:30 UTC del 15-oct = 22:30 del 14-oct en Bogotá (UTC-5).
    expect(screen.getByText(/Conectada el 14\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('P_KEY')).not.toBeInTheDocument();
  });

  it('clears the secret keys from the form after a submit, even when it fails', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    stubFetch((url, init) => {
      if (url.includes('/org/epayco/connect') && init?.method === 'PUT') {
        return { status: 422, body: { message: 'Llaves inválidas' } };
      }
      if (url.includes('/org/epayco/status')) return { body: { connected: false } };
      return { body: BASE_ORG };
    });
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    await screen.findByLabelText('P_KEY');
    fillKeys();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar ePayco' }));

    expect(await screen.findByText('No se pudo conectar ePayco')).toBeInTheDocument();
    expect(screen.getByLabelText('P_KEY')).toHaveValue('');
    expect(screen.getByLabelText('PRIVATE_KEY')).toHaveValue('');
    // Lo no secreto se conserva para no obligar a reescribirlo.
    expect(screen.getByLabelText('P_CUST_ID_CLIENTE')).toHaveValue('123456');
  });

  it('rejects a non-numeric P_CUST_ID_CLIENTE without calling the API', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    const calls = stubFetch((url) =>
      url.includes('/org/epayco/status') ? { body: { connected: false } } : { body: BASE_ORG },
    );
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    await screen.findByLabelText('P_KEY');
    fillKeys();
    fireEvent.change(screen.getByLabelText('P_CUST_ID_CLIENTE'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar ePayco' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('solo números');
    expect(calls.some((c) => c.url.endsWith('/org/epayco/connect'))).toBe(false);
  });
});
