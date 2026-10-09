import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSED_CAPABILITIES, Role } from '@adoptafacil/contracts';
import { OPEN_CAPABILITIES, renderShell } from '../../test-utils';

/**
 * Ola 1 · R1-1 / R0-2: with the capabilities production publishes today
 * (every deferred module off, no Google sign-in), the web neither links to
 * nor renders those modules, and shows no Google button.
 */
const owner = {
  initialStatus: 'authenticated' as const,
  initialUser: {
    id: 'u1',
    name: 'Tester',
    email: 'tester@example.test',
    roles: [Role.Owner],
    organizationId: 'org-1',
    accountType: 'organization' as const,
  },
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [],
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('switched-off modules (R1-1)', () => {
  it.each([
    '/donaciones',
    '/mis-donaciones',
    '/apadrinar',
    '/marketplace',
    '/recursos',
    '/comunidad',
    '/resenas',
    '/verificar/ABC123',
  ])('%s renders "not found"', (route) => {
    renderShell({ route, session: owner, capabilities: CLOSED_CAPABILITIES });
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  it('keeps MVP routes reachable', async () => {
    renderShell({ route: '/campanas', capabilities: CLOSED_CAPABILITIES });
    expect(screen.queryByRole('heading', { name: 'Página no encontrada' })).toBeNull();
  });

  it('hides their menu entries and keeps the MVP ones', async () => {
    renderShell({ route: '/inicio', session: owner, capabilities: CLOSED_CAPABILITIES });
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    for (const label of ['Donaciones', 'Apadrinamientos', 'Banco de recursos', 'Comunidad']) {
      expect(within(nav).queryByRole('button', { name: label })).toBeNull();
    }
    for (const label of ['Marketplace', 'Reseñas del portal', 'Reseñas']) {
      expect(within(nav).queryByRole('link', { name: label })).toBeNull();
    }
    expect(within(nav).getByRole('link', { name: 'Animales' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Campañas' })).toBeInTheDocument();
  });

  it('shows them again when the API turns them on', async () => {
    renderShell({ route: '/inicio', session: owner, capabilities: OPEN_CAPABILITIES });
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: 'Donaciones' })).toBeInTheDocument(),
    );
    expect(within(nav).getByRole('link', { name: 'Marketplace' })).toBeInTheDocument();
  });
});

describe('Google sign-in (R0-2, AF-029)', () => {
  it('shows no Google button and no "o" divider when the API does not serve it', () => {
    renderShell({
      route: '/login',
      session: { initialStatus: 'unauthenticated' },
      capabilities: CLOSED_CAPABILITIES,
    });
    expect(screen.queryByText(/Continuar con Google/)).toBeNull();
    expect(screen.queryByTestId('google-sign-in-fake-button')).toBeNull();
    expect(screen.queryByText('o')).toBeNull();
  });

  it('keeps the test button on the dev server when the API serves Google', () => {
    renderShell({
      route: '/login',
      session: { initialStatus: 'unauthenticated' },
      capabilities: OPEN_CAPABILITIES,
    });
    expect(screen.getByTestId('google-sign-in-fake-button')).toBeInTheDocument();
  });
});
