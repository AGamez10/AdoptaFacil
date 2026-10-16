import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * "Cobros pendientes de conexión" (ePayco): aviso con UN siguiente paso en el
 * área de gestión — solo Owner/Administrator, solo sin conectar, nunca un error.
 */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Dueña',
        email: 'duena@patitas.org',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

function stubFetch(epaycoStatus: { status?: number; body: unknown }) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const { status, body } = url.includes('/org/epayco/status')
        ? { status: epaycoStatus.status ?? 200, body: epaycoStatus.body }
        : { status: 200, body: url.includes('/donations/received') ? [] : {} };
      return Promise.resolve({
        ok: status < 400,
        status,
        headers: { get: () => null },
        json: async () => body,
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe('PaymentsConnectionBanner', () => {
  it('Owner, not connected: shows the pending status with "Empezar" on received donations', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    stubFetch({ body: { connected: false } });
    renderShell({ route: '/donaciones-recibidas', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Cobros pendientes de conexión')).toBeInTheDocument();
    expect(screen.getByTestId('payments-pending-action')).toHaveTextContent('Empezar');
    expect(screen.getByTestId('payments-pending-action')).toHaveAttribute(
      'href',
      '/organizacion?tab=pagos&conectar=1',
    );
  });

  it('shows "Continuar conexión" and the saved progress when a draft exists', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    window.localStorage.setItem(
      'af:epayco-connect-draft:org-1',
      JSON.stringify({
        step: 'cust-id',
        path: 'has-account',
        checklist: [],
        custId: '',
        publicKey: '',
      }),
    );
    stubFetch({ body: { connected: false } });
    renderShell({ route: '/inicio', ...sessionWith([Role.Administrator]) });

    expect(await screen.findByTestId('payments-pending-action')).toHaveTextContent(
      'Continuar conexión',
    );
    expect(screen.getByTestId('payments-pending-progress')).toHaveTextContent('Paso 2 de 5');
  });

  it('connected: a calm "Cobros activos" on received donations, nothing on Inicio', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    stubFetch({ body: { connected: true, custId: '1' } });
    const { unmount } = renderShell({
      route: '/donaciones-recibidas',
      ...sessionWith([Role.Owner]),
    });
    expect(await screen.findByText('Cobros activos')).toBeInTheDocument();
    expect(screen.queryByText('Cobros pendientes de conexión')).not.toBeInTheDocument();
    unmount();

    const calls = stubFetch({ body: { connected: true } });
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });
    await waitFor(() => expect(calls.some((u) => u.includes('/org/epayco/status'))).toBe(true));
    expect(screen.queryByText('Cobros activos')).not.toBeInTheDocument();
    expect(screen.queryByText('Cobros pendientes de conexión')).not.toBeInTheDocument();
  });

  it('is never shown to an Operator (not even fetched), nor with Mercado Pago', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    const calls = stubFetch({ body: { connected: false } });
    const { unmount } = renderShell({
      route: '/donaciones-recibidas',
      ...sessionWith([Role.Operator]),
    });
    expect(
      await screen.findByRole('heading', { name: 'Donaciones recibidas' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Cobros pendientes de conexión')).not.toBeInTheDocument();
    expect(calls.some((u) => u.includes('/org/epayco/status'))).toBe(false);
    unmount();

    vi.unstubAllEnvs();
    const mpCalls = stubFetch({ body: { connected: false } });
    renderShell({ route: '/donaciones-recibidas', ...sessionWith([Role.Owner]) });
    expect(
      await screen.findByRole('heading', { name: 'Donaciones recibidas' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Cobros pendientes de conexión')).not.toBeInTheDocument();
    expect(mpCalls.some((u) => u.includes('/org/epayco/status'))).toBe(false);
  });

  it('shows nothing (never an error) when the status cannot be loaded', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'epayco');
    const calls = stubFetch({ status: 500, body: {} });
    renderShell({ route: '/donaciones-recibidas', ...sessionWith([Role.Owner]) });

    await waitFor(() => expect(calls.some((u) => u.includes('/org/epayco/status'))).toBe(true));
    expect(screen.queryByText('Cobros pendientes de conexión')).not.toBeInTheDocument();
    expect(screen.queryByText('Cobros activos')).not.toBeInTheDocument();
  });
});
