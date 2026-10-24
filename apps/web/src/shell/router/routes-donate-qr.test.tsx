import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { FEATURE_KEYS, type PublicCapabilities } from '@adoptafacil/contracts';
import { renderShell } from '../../test-utils';

/**
 * Destino del QR de donaciones (ADR-PAG-002 §QR): `/o/:slug/donar` y `/donar`
 * en un subdominio real resuelven la org pública y entran a `/donaciones`.
 */
const ORG = { id: 'org-1', name: 'Refugio Patitas', slug: 'patitas' };

function stubFetch(orgStatus = 200, canReceiveDonations = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/by-subdomain/')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ slug: 'patitas' }) });
      }
      if (url.includes('/availability')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ canReceiveDonations }),
        });
      }
      if (url.includes('/public/organizations/patitas')) {
        return Promise.resolve({
          ok: orgStatus < 400,
          status: orgStatus,
          json: async () => (orgStatus < 400 ? ORG : {}),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    }),
  );
}

const guest = { session: { initialStatus: 'unauthenticated' as const } };

describe('QR de donaciones — rutas públicas', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('/o/:slug/donar redirects to the donation flow of that organization', async () => {
    stubFetch();
    renderShell({ route: '/o/patitas/donar', ...guest });

    expect(await screen.findByRole('heading', { name: 'Donar' })).toBeInTheDocument();
    expect(screen.getByText('Tu aporte para Refugio Patitas.')).toBeInTheDocument();
    expect(await screen.findByPlaceholderText('50000')).toBeInTheDocument();
  });

  it('/o/:slug/donar lands on a warm message (never an error) when the org cannot receive donations yet', async () => {
    stubFetch(200, false);
    renderShell({ route: '/o/patitas/donar', ...guest });

    const notice = await screen.findByTestId('donation-org-not-connected');
    expect(notice).toHaveTextContent('Este refugio está activando sus donaciones en línea.');
    expect(notice).toHaveTextContent('Refugio Patitas');
    expect(
      screen.getByRole('link', { name: 'Conocer a sus animales en adopción' }),
    ).toHaveAttribute('href', '/o/patitas');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('50000')).not.toBeInTheDocument();
  });

  it('/o/:slug/donar shows "no encontrada" for an unknown organization', async () => {
    stubFetch(404);
    renderShell({ route: '/o/patitas/donar', ...guest });

    expect(await screen.findByText('Organización no encontrada')).toBeInTheDocument();
  });

  it('/o/:slug/donar is "not found" when the payments module is off', async () => {
    stubFetch();
    const capabilities: PublicCapabilities = {
      features: Object.fromEntries(
        FEATURE_KEYS.map((key) => [key, key !== 'payments']),
      ) as PublicCapabilities['features'],
      googleSignIn: true,
    };
    renderShell({ route: '/o/patitas/donar', ...guest, capabilities });

    expect(
      await screen.findByRole('heading', { name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Donar' })).not.toBeInTheDocument();
  });

  it('/donar on a real organization subdomain opens that organization’s donation flow', async () => {
    vi.stubEnv('VITE_PORTAL_BASE_DOMAIN', 'adoptafacil.org');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'patitas.adoptafacil.org' },
    });
    stubFetch();
    renderShell({ route: '/donar', ...guest });

    expect(await screen.findByText('Tu aporte para Refugio Patitas.')).toBeInTheDocument();
  });
});
