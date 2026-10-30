import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * Pestañas "Código QR" (QR fijo de la organización) y "Medios de pago"
 * (ADR-PAG-002): "Conectar ePayco" (la única pasarela; Mercado Pago se retiró
 * el 2026-10-17).
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

describe('Medios de pago — asistente "Conectar ePayco" (VITE_PAYMENT_PROVIDER=epayco)', () => {
  const DRAFT_KEY = 'af:epayco-connect-draft:org-1';

  afterEach(() => window.localStorage.clear());

  type MaybeHandler = (
    url: string,
    init?: RequestInit,
  ) => { status?: number; body: unknown } | undefined;

  function statusStub(extra?: MaybeHandler): Handler {
    return (url, init) => {
      const custom = extra?.(url, init);
      if (custom) return custom;
      if (url.includes('/org/epayco/status')) return { body: { connected: false } };
      return { body: BASE_ORG };
    };
  }

  async function openWizard() {
    await openPaymentsTab();
    expect(await screen.findByText('Cobros pendientes de conexión')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    return screen.findByRole('heading', { name: '¿Tu refugio ya tiene cuenta en ePayco?' });
  }

  async function walkYesPath() {
    fireEvent.click(screen.getByRole('button', { name: 'Sí, ya tengo' }));
    expect(await screen.findByRole('heading', { name: 'Tu número de cliente' })).toHaveFocus();
    expect(screen.getByTestId('epayco-wizard-progress')).toHaveTextContent('Paso 2 de 5');
    expect(screen.getAllByText(/Integraciones → Llaves API/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('P_CUST_ID_CLIENTE'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await screen.findByRole('heading', { name: 'Tu llave pública' });
    fireEvent.change(screen.getByLabelText('PUBLIC_KEY'), { target: { value: 'pub-abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await screen.findByRole('heading', { name: 'Tus dos llaves secretas' });
    expect(screen.getByText(/nunca se vuelven a mostrar/)).toBeInTheDocument();
    for (const label of ['P_KEY', 'PRIVATE_KEY']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password');
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'off');
    }
    fireEvent.change(screen.getByLabelText('P_KEY'), { target: { value: 'pkey-secreta' } });
    fireEvent.change(screen.getByLabelText('PRIVATE_KEY'), { target: { value: 'priv-secreta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await screen.findByRole('heading', { name: 'Revisa y conecta' });
    expect(screen.getByTestId('epayco-review-cust-id')).toHaveTextContent('123456');
    expect(screen.getByTestId('epayco-review-public-key')).toHaveTextContent('…1234');
    expect(screen.queryByText('pkey-secreta')).not.toBeInTheDocument();
  }

  it('shows the ePayco card (not Mercado Pago) with a calm "pending" status, never an error', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    stubFetch(statusStub());
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByRole('heading', { name: 'ePayco' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mercado Pago' })).not.toBeInTheDocument();
    expect(await screen.findByText('Cobros pendientes de conexión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Empezar' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Sin formulario plano: las llaves se piden dentro del asistente.
    expect(screen.queryByLabelText('P_KEY')).not.toBeInTheDocument();
  });

  it('shows the ePayco card by default (VITE_PAYMENT_PROVIDER unset) and never Mercado Pago', async () => {
    const calls = stubFetch(statusStub());
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByRole('heading', { name: 'ePayco' })).toBeInTheDocument();
    expect(screen.queryByText(/Mercado ?Pago/i)).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/org/mercadopago'))).toBe(false);
  });

  it('kill switch (VITE_PAYMENT_PROVIDER=off): a calm note, no connect card, no status call', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'off');
    const calls = stubFetch(statusStub());
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByTestId('payments-online-off')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ePayco' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Mercado ?Pago/i)).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/org/epayco/status'))).toBe(false);
  });

  it('"Sí" path: one field per screen, then PUTs the four keys, clears the secrets and the draft', async () => {
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

    expect(await openWizard()).toHaveFocus();
    await walkYesPath();
    // El borrador nunca lleva llaves secretas, ni siquiera a mitad de camino.
    const midDraft = window.localStorage.getItem(DRAFT_KEY) ?? '';
    expect(midDraft).toContain('123456');
    expect(midDraft).not.toContain('pkey-secreta');
    expect(midDraft).not.toContain('priv-secreta');

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

    expect(await screen.findByTestId('payments-active-status')).toHaveTextContent('Cobros activos');
    expect(screen.getByTestId('epayco-cust-id')).toHaveTextContent('123456');
    expect(screen.getByTestId('epayco-key-hint')).toHaveTextContent('…1234');
    // 03:30 UTC del 15-oct = 22:30 del 14-oct en Bogotá (UTC-5).
    expect(screen.getByText(/Conectada el 14\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('P_KEY')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('"No todavía" path: plain guidance, ePayco in a new tab, help contact, and "Lo haré después" saves a draft', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    stubFetch(statusStub());
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openWizard();
    fireEvent.click(screen.getByRole('button', { name: 'No todavía' }));
    expect(
      await screen.findByRole('heading', { name: 'Abre la cuenta de tu refugio en ePayco' }),
    ).toHaveFocus();
    expect(screen.getByText(/Abrir la cuenta es gratis/)).toBeInTheDocument();
    expect(screen.getByText(/persona natural/)).toBeInTheDocument();
    expect(
      screen.getByText('ePayco te dirá exactamente qué necesita según tu caso.'),
    ).toBeVisible();
    const link = screen.getByRole('link', { name: 'Abrir ePayco en otra pestaña' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');

    fireEvent.click(screen.getByRole('button', { name: 'Pedir ayuda a AdoptaFácil' }));
    const help = screen.getByTestId('epayco-help');
    expect(within(help).getByRole('link', { name: 'Escribir por WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/'),
    );
    expect(
      within(help).getByRole('link', { name: /adoptafacil\.oficial@gmail\.com/ }),
    ).toHaveAttribute('href', expect.stringMatching(/^mailto:/));

    fireEvent.click(screen.getByLabelText(/Tu cédula de ciudadanía/));
    fireEvent.click(screen.getByRole('button', { name: 'Lo haré después' }));

    // Vuelve al resumen con el avance a la vista y un solo siguiente paso.
    expect(await screen.findByTestId('payments-pending-progress')).toHaveTextContent('Paso 1 de 5');
    expect(screen.getByRole('button', { name: 'Continuar conexión' })).toBeInTheDocument();
    const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? '{}');
    expect(draft).toMatchObject({ step: 'guide', path: 'no-account', checklist: ['cedula'] });
    expect(Object.keys(draft).sort()).toEqual(
      ['checklist', 'custId', 'path', 'publicKey', 'step', 'updatedAt'].sort(),
    );
  });

  it('"Guardar y seguir después" on the secrets screen keeps custId/publicKey but never the secrets', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    stubFetch(statusStub());
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, ya tengo' }));
    fireEvent.change(await screen.findByLabelText('P_CUST_ID_CLIENTE'), {
      target: { value: '777' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.change(await screen.findByLabelText('PUBLIC_KEY'), { target: { value: 'pub-9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.change(await screen.findByLabelText('P_KEY'), { target: { value: 'secreto-1' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'No lo tengo a la mano: guardar y seguir después' }),
    );

    expect(await screen.findByRole('button', { name: 'Continuar conexión' })).toBeInTheDocument();
    const raw = window.localStorage.getItem(DRAFT_KEY) ?? '';
    expect(JSON.parse(raw)).toMatchObject({
      step: 'secrets',
      custId: '777',
      publicKey: 'pub-9999',
    });
    expect(raw).not.toContain('secreto-1');
    expect(raw).not.toMatch(/pKey|privateKey/);
  });

  it('resumes from a saved draft (secrets screen, never prefilled) and can start over', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    // Un borrador manipulado con llaves secretas: se ignoran al leerlo.
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: 'review',
        path: 'has-account',
        checklist: [],
        custId: '123456',
        publicKey: 'pub-abcd1234',
        pKey: 'filtrada',
        updatedAt: '2026-10-01T00:00:00.000Z',
      }),
    );
    stubFetch(statusStub());
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openPaymentsTab();
    expect(await screen.findByTestId('payments-pending-progress')).toHaveTextContent(
      'Paso 4 de 5: Llaves secretas',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continuar conexión' }));
    expect(await screen.findByRole('heading', { name: 'Tus dos llaves secretas' })).toHaveFocus();
    expect(screen.getByLabelText('P_KEY')).toHaveValue('');
    expect(screen.getByLabelText('PRIVATE_KEY')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByLabelText('PUBLIC_KEY')).toHaveValue('pub-abcd1234');
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByLabelText('P_CUST_ID_CLIENTE')).toHaveValue('123456');

    fireEvent.click(
      screen.getByRole('button', { name: 'No lo tengo a la mano: guardar y seguir después' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Empezar de nuevo' }));
    expect(
      await screen.findByRole('heading', { name: '¿Tu refugio ya tiene cuenta en ePayco?' }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('opens the wizard directly from "?tab=pagos&conectar=1" (the status banners)', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    stubFetch(statusStub());
    renderShell({ route: '/organizacion?tab=pagos&conectar=1', ...ownerSession() });

    expect(
      await screen.findByRole('heading', { name: '¿Tu refugio ya tiene cuenta en ePayco?' }),
    ).toBeInTheDocument();
  });

  it('409: friendly "already connected elsewhere" message, help offered, secrets cleared', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    stubFetch(
      statusStub((url, init) =>
        url.includes('/org/epayco/connect') && init?.method === 'PUT'
          ? {
              status: 409,
              body: { message: 'Esta cuenta de ePayco ya está conectada a otra organización.' },
            }
          : undefined,
      ),
    );
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openWizard();
    await walkYesPath();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar ePayco' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esa cuenta ePayco ya está conectada a otra organización. Si crees que es un error, escríbenos.',
    );
    expect(screen.getByTestId('epayco-help')).toBeInTheDocument();
    expect(screen.getByLabelText('P_CUST_ID_CLIENTE')).toHaveValue('123456');
    // Las secretas no sobreviven a un envío fallido: al volver a esa pantalla están vacías.
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(await screen.findByLabelText('P_KEY')).toHaveValue('');
    expect(screen.getByLabelText('PRIVATE_KEY')).toHaveValue('');
  });

  it('400 points to the likely field; a 5xx says the data was not lost — never a raw error', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    let status = 400;
    stubFetch(
      statusStub((url, init) =>
        url.includes('/org/epayco/connect') && init?.method === 'PUT'
          ? { status, body: { message: ['publicKey: La llave no puede contener espacios.'] } }
          : undefined,
      ),
    );
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openWizard();
    await walkYesPath();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar ePayco' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa tu llave pública');
    expect(screen.getByRole('heading', { name: 'Tu llave pública' })).toBeInTheDocument();
    expect(screen.queryByText(/La llave no puede contener espacios/)).not.toBeInTheDocument();

    status = 503;
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.change(await screen.findByLabelText('P_KEY'), { target: { value: 'k1' } });
    fireEvent.change(screen.getByLabelText('PRIVATE_KEY'), { target: { value: 'k2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar ePayco' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar ahora. Tus datos no se perdieron; intenta de nuevo.',
    );
  });

  it('rejects a non-numeric P_CUST_ID_CLIENTE inline, without calling the API', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    const calls = stubFetch(statusStub());
    renderShell({ route: '/organizacion', ...ownerSession() });

    await openWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, ya tengo' }));
    fireEvent.change(await screen.findByLabelText('P_CUST_ID_CLIENTE'), {
      target: { value: 'abc' },
    });
    expect(screen.getByText('Solo debe tener números.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText(/Solo debe tener números\. Revisa/)).toBeInTheDocument();
    expect(screen.getByLabelText('P_CUST_ID_CLIENTE')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { name: 'Tu número de cliente' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/org/epayco/connect'))).toBe(false);
  });
});
