import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Role, type PortalDomainView } from '@adoptafacil/contracts';
import { AppProviders } from '../../../shell/app-providers';
import { CustomDomainCard } from './custom-domain-card';

const session = {
  initialStatus: 'authenticated' as const,
  initialUser: {
    id: 'u1',
    name: 'Owner',
    email: 'owner@refugio.test',
    roles: [Role.Owner],
    organizationId: 'org-1',
    accountType: 'organization' as const,
  },
};

const base: PortalDomainView = {
  state: 'none',
  planIncludes: true,
  domain: null,
  records: [],
  lastCheckedAt: null,
  lastError: null,
  verifiedAt: null,
};

function stub(handler: (url: string, init?: RequestInit) => PortalDomainView) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => handler(url, init),
      });
    }),
  );
  return calls;
}

function renderCard(onActive = vi.fn()) {
  render(
    <AppProviders session={session}>
      <MemoryRouter>
        <CustomDomainCard onActiveDomain={onActive} />
      </MemoryRouter>
    </AppProviders>,
  );
  return onActive;
}

afterEach(() => vi.unstubAllGlobals());

describe('CustomDomainCard (dominio propio, Pro)', () => {
  it('pedir un dominio muestra los dos registros DNS a crear; verificar lo deja activo', async () => {
    const pending: PortalDomainView = {
      ...base,
      state: 'pending_dns',
      domain: 'www.patitas.org',
      records: [
        { type: 'CNAME', name: 'www.patitas.org', value: 'portales.adoptafacil.org' },
        { type: 'TXT', name: '_adoptafacil.www.patitas.org', value: 'adoptafacil-verify=abc' },
      ],
      lastError: 'txt_missing',
    };
    let current: PortalDomainView = base;
    const calls = stub((url, init) => {
      if (init?.method === 'PUT') current = pending;
      if (url.endsWith('/verify'))
        current = { ...pending, state: 'active', lastError: null, records: [] };
      return current;
    });
    const onActive = renderCard();

    fireEvent.change(await screen.findByTestId('custom-domain-input'), {
      target: { value: 'www.patitas.org' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByTestId('custom-domain-pending')).toBeInTheDocument();
    expect(screen.getByText('portales.adoptafacil.org')).toBeInTheDocument();
    expect(screen.getByText('adoptafacil-verify=abc')).toBeInTheDocument();
    expect(screen.getByText(/Todavía no vemos el registro TXT/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PUT')?.body).toContain('www.patitas.org');

    fireEvent.click(screen.getByTestId('custom-domain-verify'));
    expect(await screen.findByText('https://www.patitas.org')).toBeInTheDocument();
    await waitFor(() => expect(onActive).toHaveBeenLastCalledWith('www.patitas.org'));
  });

  it('sin Pro invita a ver los planes y no deja conectar', async () => {
    stub(() => ({ ...base, planIncludes: false }));
    renderCard();
    expect(await screen.findByText(/parte del plan Pro/)).toBeInTheDocument();
    expect(screen.queryByTestId('custom-domain-input')).not.toBeInTheDocument();
  });

  it('si bajó de plan, el dominio queda en pausa y lo explica', async () => {
    stub(() => ({ ...base, state: 'suspended', planIncludes: false, domain: 'www.patitas.org' }));
    renderCard();
    expect(await screen.findByTestId('custom-domain-suspended')).toHaveTextContent('en pausa');
  });

  it('sin la configuración de la plataforma dice que llega pronto', async () => {
    stub(() => ({ ...base, state: 'unavailable' }));
    renderCard();
    expect(await screen.findByText(/Estamos habilitando los dominios propios/)).toBeInTheDocument();
  });
});
