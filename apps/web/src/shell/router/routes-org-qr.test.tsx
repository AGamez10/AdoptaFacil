import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { qrDestinationPath } from '../../features/portals/pages/org-qr-redirect-page';
import { renderShell } from '../../test-utils';

/** QR fijo por organización: `/q/:code` resuelve el destino validado por la API. */
const ORG = { id: 'org-1', name: 'Refugio Patitas', slug: 'patitas' };

function stubFetch(resolution: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/public/qr/')) {
        return Promise.resolve({ ok: status < 400, status, json: async () => resolution });
      }
      if (url.includes('/availability')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ canReceiveDonations: true }),
        });
      }
      if (url.includes('/public/organizations/patitas')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    }),
  );
}

const guest = { session: { initialStatus: 'unauthenticated' as const } };

describe('QR fijo — /q/:code', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps each destination to an internal route only', () => {
    const slug = 'patitas';
    const id = '11111111-1111-4111-8111-111111111111';
    expect(qrDestinationPath({ slug, target: { kind: 'profile', id: null } }, true)).toBe(
      '/o/patitas',
    );
    expect(qrDestinationPath({ slug, target: { kind: 'donate', id: null } }, true)).toBe(
      '/o/patitas/donar',
    );
    expect(qrDestinationPath({ slug, target: { kind: 'donate', id: null } }, false)).toBe(
      '/o/patitas',
    );
    expect(qrDestinationPath({ slug, target: { kind: 'campaign', id } }, true)).toBe(
      `/campanas/${id}`,
    );
    expect(qrDestinationPath({ slug, target: { kind: 'animal', id } }, true)).toBe(
      `/o/patitas/animales/${id}`,
    );
  });

  it('a donate destination opens that organization’s donation flow', async () => {
    stubFetch({ slug: 'patitas', target: { kind: 'donate', id: null } });
    renderShell({ route: '/q/abcd2345', ...guest });

    expect(await screen.findByText('Tu aporte para Refugio Patitas.')).toBeInTheDocument();
  });

  it('an unknown code shows a calm "no encontrado"', async () => {
    stubFetch({}, 404);
    renderShell({ route: '/q/abcd2345', ...guest });

    expect(await screen.findByText('Código no encontrado')).toBeInTheDocument();
  });
});
