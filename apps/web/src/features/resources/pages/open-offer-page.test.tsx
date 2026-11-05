import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

const session = {
  session: {
    initialStatus: 'authenticated' as const,
    initialUser: {
      id: 'u1',
      name: 'Laura',
      email: 'l@test.local',
      roles: [] as Role[],
      organizationId: 'person-1',
      accountType: 'person' as const,
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenOfferPage (/tengo-para-donar)', () => {
  it('never lists medicine and sends the open offer with department and city', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 201,
        headers: { get: () => null },
        json: async () =>
          init?.method === 'POST'
            ? {
                id: 'o1',
                title: 'Cobijas',
                category: 'supplies',
                quantity: 2,
                unit: 'unidades',
                department: 'Antioquia',
                city: 'Medellín',
                status: 'open',
                expired: false,
                expiresAt: '2026-12-30T00:00:00.000Z',
                createdAt: '2026-10-31T00:00:00.000Z',
              }
            : {},
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderShell({ route: '/tengo-para-donar', ...session });

    const type = await screen.findByLabelText('Tipo');
    expect(Array.from((type as HTMLSelectElement).options).map((o) => o.textContent)).not.toContain(
      'Medicamentos',
    );
    fireEvent.change(screen.getByLabelText('Qué es'), { target: { value: 'Cobijas' } });
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Departamento'), { target: { value: 'Antioquia' } });
    fireEvent.change(screen.getByLabelText('Municipio'), { target: { value: 'Medellín' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dejar mi ofrecimiento' }));

    expect(
      await screen.findByText('¡Listo! Tu ofrecimiento ya está en el banco'),
    ).toBeInTheDocument();
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(String(post?.[0])).toContain('/resources/open-offers');
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
        title: 'Cobijas',
        category: 'supplies',
        quantity: 2,
        department: 'Antioquia',
        city: 'Medellín',
      });
    });
  });
});
