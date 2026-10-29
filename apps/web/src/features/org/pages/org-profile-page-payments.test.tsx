import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * Pestañas "Código QR" (QR fijo de la organización) y "Medios de pago"
 * (Mercado Pago por OAuth, ADR-PAG-003; con el interruptor de apagado, un aviso
 * tranquilo en lugar de "Conectar").
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

const QR = {
  code: 'abcd2345',
  target: { kind: 'donate', id: null },
  effectiveTarget: { kind: 'donate', id: null },
  campaigns: [{ id: '11111111-1111-4111-8111-111111111111', label: 'Cirugía de Luna' }],
  animals: [],
  scansLast30Days: 7,
};

async function openQrTab() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Código QR' }));
}

describe('Código QR — QR fijo de la organización', () => {
  it('shows the fixed /q/<code> URL, its destination and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    stubFetch((url) => (url.endsWith('/org/qr') ? { body: QR } : { body: BASE_ORG }));
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openQrTab();
    const card = await screen.findByTestId('org-qr-card');
    const expected = `${window.location.origin}/q/abcd2345`;
    expect(await within(card).findByTestId('qr-share-url')).toHaveTextContent(expected);
    expect(await within(card).findByTestId('qr-share-image')).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/png/),
    );
    expect(within(card).getByTestId('org-qr-effective')).toHaveTextContent(
      'donar a la organización',
    );
    expect(within(card).getByText('Escaneos en los últimos 30 días: 7')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected));
  });

  it('changes the destination to a campaign without changing the code', async () => {
    const calls = stubFetch((url, init) => {
      if (url.endsWith('/org/qr/target')) {
        const body = JSON.parse(String(init?.body));
        return { body: { ...QR, target: body, effectiveTarget: body } };
      }
      return url.endsWith('/org/qr') ? { body: QR } : { body: BASE_ORG };
    });
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openQrTab();
    const card = await screen.findByTestId('org-qr-card');
    fireEvent.click(await within(card).findByRole('radio', { name: 'Una campaña' }));
    fireEvent.change(within(card).getByLabelText('Campaña activa'), {
      target: { value: QR.campaigns[0].id },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Guardar destino' }));

    await waitFor(() =>
      expect(within(card).getByTestId('org-qr-effective')).toHaveTextContent(
        'la campaña «Cirugía de Luna»',
      ),
    );
    const put = calls.find((c) => c.url.endsWith('/org/qr/target'));
    expect(put?.init?.method).toBe('PUT');
    expect(JSON.parse(String(put?.init?.body))).toEqual({
      kind: 'campaign',
      id: QR.campaigns[0].id,
    });
    expect(within(card).getByTestId('qr-share-url')).toHaveTextContent('/q/abcd2345');
  });

  it('asks to set the portal link first when there is no slug', async () => {
    stubFetch((url) =>
      url.endsWith('/org/qr') ? { body: QR } : { body: { id: 'org-1', name: 'Refugio Patitas' } },
    );
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openQrTab();
    expect(await screen.findByTestId('org-qr-needs-link')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Definir el enlace del portal' }));
    expect(screen.getByRole('tab', { name: 'Datos institucionales' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('Medios de pago — interruptor de apagado', () => {
  it('kill switch (VITE_PAYMENT_PROVIDER=off): a calm note, no connect card, no status call', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'off');
    const calls = stubFetch((url) => (url.endsWith('/org/qr') ? { body: QR } : { body: BASE_ORG }));
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByTestId('payments-online-off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conectar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls.every((c) => !c.url.includes('/status'))).toBe(true);
  });
});

describe('Medios de pago — "Conectar Mercado Pago" por OAuth (por defecto, ADR-PAG-003)', () => {
  function mpStub(
    status: Record<string, unknown>,
    onCall?: (url: string, init?: RequestInit) => void,
  ) {
    return (url: string, init?: RequestInit) => {
      onCall?.(url, init);
      if (url.includes('/org/mercadopago/status')) return { body: status };
      if (url.includes('/org/mercadopago/connect') && init?.method === 'DELETE') {
        return { body: { ok: true } };
      }
      if (url.includes('/org/mercadopago/connect')) {
        return {
          body: {
            authorizeUrl: 'https://auth.mercadopago.com.co/authorization?client_id=1&state=s',
          },
        };
      }
      return { body: BASE_ORG };
    };
  }

  it('by default shows the Mercado Pago card; "Conectar" navigates to Mercado Pago (no secrets asked)', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const calls = stubFetch(mpStub({ connected: false }));
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByRole('heading', { name: 'Mercado Pago' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/PRIVATE_KEY|P_KEY|contraseña/i)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByTestId('mercadopago-connect'));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://auth.mercadopago.com.co/authorization?client_id=1&state=s',
      ),
    );
  });

  it('connected: shows the account, flags a test account and disconnects after confirming', async () => {
    const calls = stubFetch(
      mpStub({
        connected: true,
        status: 'active',
        mpUserId: '123456789',
        liveMode: false,
        connectedAt: '2026-11-06T15:00:00.000Z',
      }),
    );
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByTestId('mercadopago-user-id')).toHaveTextContent('123456789');
    expect(screen.getByTestId('mercadopago-test-mode')).toBeInTheDocument();
    expect(screen.getByTestId('payments-active-status')).toHaveTextContent('Mercado Pago');
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desconectar' }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.url.includes('/org/mercadopago/connect') && c.init?.method === 'DELETE',
        ),
      ).toBe(true),
    );
  });

  it('needs_reconnect: says donations are paused and offers to reconnect', async () => {
    stubFetch(mpStub({ connected: false, status: 'needs_reconnect', mpUserId: '1' }));
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByTestId('mercadopago-needs-reconnect')).toHaveTextContent(
      'Tus donaciones en línea están en pausa',
    );
    expect(screen.getByTestId('mercadopago-connect')).toHaveTextContent('Reconectar Mercado Pago');
  });

  it('back from Mercado Pago with an account already linked elsewhere: a clear message', async () => {
    stubFetch(mpStub({ connected: false }));
    renderShell({
      route: '/organizacion?tab=pagos&mercadopago=already_linked',
      ...ownerSession(),
    });
    expect(
      await screen.findByText('Esa cuenta ya está conectada a otra organización'),
    ).toBeInTheDocument();
  });
});
