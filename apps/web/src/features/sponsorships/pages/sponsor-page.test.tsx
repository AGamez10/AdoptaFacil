import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SponsorshipPaymentStatus,
  SponsorshipPeriodicity,
  SponsorshipStatus,
  type Sponsorship,
} from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * S2-03 — `/apadrinar`, mismo doble-propósito que `/donaciones` (T-064): SIN
 * animalId → "Mis apadrinamientos" (`GET /sponsorships/mine`); CON animalId →
 * ver los planes (`GET /public/sponsorships/animals/:id`). Mercado Pago se
 * retiró (2026-10-17) y hoy ninguna pasarela cobra apadrinamientos: la web muestra
 * "Pronto podrás apadrinar con pago en línea" en vez de un flujo roto.
 */
function personSession() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'padrino-1',
        name: 'Padrino Tester',
        email: 'padrino@example.test',
        roles: [],
        organizationId: 'org-padrino-1',
        accountType: 'person' as const,
      },
    },
  };
}

function sponsorship(over: Partial<Sponsorship> = {}): Sponsorship {
  return {
    id: 's-1',
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    planId: 'plan-1',
    planName: 'Padrinazgo mensual',
    planAmount: 30_000,
    planPeriodicity: SponsorshipPeriodicity.Monthly,
    animalId: 'animal-1',
    animalName: 'Firulais',
    sponsorUserId: 'padrino-1',
    status: SponsorshipStatus.Active,
    startedAt: '2026-07-28T21:25:22.299Z',
    createdAt: '2026-07-28T21:25:22.299Z',
    ...over,
  };
}

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const body = handler(String(input), init);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => body,
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('SponsorPage — sin animalId muestra "Mis apadrinamientos"', () => {
  it('lista los apadrinamientos propios con animal, org, monto y estado', async () => {
    stubFetch((url) => {
      if (url.includes('/sponsorships/mine')) return [sponsorship()];
      return [];
    });
    renderShell({ route: '/apadrinar', ...personSession() });

    expect(await screen.findByRole('heading', { name: 'Mis apadrinamientos' })).toBeInTheDocument();
    expect(await screen.findByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Refugio Patitas')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText(/30\.000/)).toBeInTheDocument();
  });

  it('muestra un estado vacío claro (no error, no pantalla en blanco) sin apadrinamientos', async () => {
    stubFetch(() => []);
    renderShell({ route: '/apadrinar', ...personSession() });

    expect(await screen.findByRole('heading', { name: 'Mis apadrinamientos' })).toBeInTheDocument();
    expect(await screen.findByText(/Aún no apadrinas a ningún animal/)).toBeInTheDocument();
  });

  it('muestra un mensaje de error (no un crash) si la carga falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => null },
        json: async () => ({ code: 'server_error' }),
      }),
    );
    renderShell({ route: '/apadrinar', ...personSession() });

    expect(
      await screen.findByText(/No se pudieron cargar tus apadrinamientos/),
    ).toBeInTheDocument();
  });

  it('no ofrece "Ver historial" (hallazgo S2-03: el backend no expone el historial de estado al padrino)', async () => {
    stubFetch((url) => {
      if (url.includes('/sponsorships/mine')) return [sponsorship()];
      return [];
    });
    renderShell({ route: '/apadrinar', ...personSession() });

    await screen.findByText('Firulais');
    expect(screen.queryByRole('button', { name: 'Ver historial' })).not.toBeInTheDocument();
  });

  it('S-5-REDISEÑO: muestra el aviso de pago en riesgo desde el 2º intento pendiente', async () => {
    stubFetch((url) => {
      if (url.includes('/sponsorships/mine')) {
        return [
          sponsorship({
            currentPeriodStatus: SponsorshipPaymentStatus.Pending,
            currentPeriodAttemptCount: 2,
          }),
        ];
      }
      return [];
    });
    renderShell({ route: '/apadrinar', ...personSession() });

    await screen.findByText('Firulais');
    expect(screen.getByText(/intento 2 de 3/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pagar de nuevo/ })).not.toBeInTheDocument();
  });

  it('un apadrinamiento suspendido por pago fallido muestra un aviso tranquilo (sin "Pagar de nuevo" roto)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/sponsorships/mine')) {
        return [
          sponsorship({
            status: SponsorshipStatus.Suspended,
            currentPeriodStatus: SponsorshipPaymentStatus.Failed,
          }),
        ];
      }
      return [];
    });
    renderShell({ route: '/apadrinar', ...personSession() });

    await screen.findByText('Firulais');
    expect(screen.getByText('Suspendido por pago fallido.')).toBeInTheDocument();
    expect(screen.getByTestId('sponsorship-retry-soon')).toHaveTextContent(
      'Pronto podrás ponerte al día con pago en línea',
    );
    expect(screen.queryByRole('button', { name: /Pagar de nuevo/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Mercado ?Pago/i)).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/retry-payment'))).toBe(false);
  });
});

function publicSummary() {
  return {
    animalId: 'animal-1',
    activePlans: [
      {
        id: 'plan-1',
        animalId: 'animal-1',
        name: 'Padrinazgo mensual',
        amount: 30_000,
        periodicity: SponsorshipPeriodicity.Monthly,
      },
    ],
    activeSponsorCount: 2,
  };
}

describe('SponsorPage — con animalId muestra los planes y "Pronto podrás apadrinar"', () => {
  it('lista el plan real y un aviso tranquilo en vez del cobro (sin Brick, sin POST)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/public/sponsorships/animals/')) return publicSummary();
      return [];
    });

    renderShell({
      route: '/apadrinar?animalId=animal-1&animalName=Firulais&organizationName=Refugio%20Patitas',
      ...personSession(),
    });

    expect(await screen.findByRole('heading', { name: 'Apadrinar' })).toBeInTheDocument();
    expect(await screen.findByText('Padrinazgo mensual')).toBeInTheDocument();
    expect(screen.getByText(/30\.000/)).toBeInTheDocument();
    expect(screen.getByText('Ya tiene 2 padrinos activos.')).toBeInTheDocument();
    expect(screen.getByTestId('sponsorship-online-soon')).toHaveTextContent(
      'Pronto podrás apadrinar con pago en línea',
    );
    expect(screen.getByTestId('sponsorship-online-soon')).toHaveTextContent('Refugio Patitas');
    expect(screen.queryByRole('button', { name: 'Apadrinar' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Mercado ?Pago/i)).not.toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);
  });

  it('muestra un mensaje claro cuando el animal no tiene plan activo', async () => {
    stubFetch((url) => {
      if (url.includes('/public/sponsorships/animals/')) {
        return { animalId: 'animal-1', activePlans: [], activeSponsorCount: 0 };
      }
      return [];
    });
    renderShell({ route: '/apadrinar?animalId=animal-1', ...personSession() });

    expect(
      await screen.findByText('Este animal no tiene un plan de apadrinamiento activo por ahora.'),
    ).toBeInTheDocument();
  });
});
