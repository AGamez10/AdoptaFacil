import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * Pestañas "Código QR" (QR fijo de la organización) y "Medios de pago"
 * (sin pasarela conectada hoy: un aviso tranquilo en lugar de "Conectar").
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

describe('Medios de pago — sin pasarela conectada', () => {
  it('shows a calm note, never a connect card or an error, and calls no gateway endpoint', async () => {
    const calls = stubFetch((url) => (url.endsWith('/org/qr') ? { body: QR } : { body: BASE_ORG }));
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByTestId('payments-online-off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conectar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls.every((c) => !c.url.includes('/status'))).toBe(true);
  });
});
