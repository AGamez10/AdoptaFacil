import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { PublicVolunteeringPage } from './public-volunteering-page';

/**
 * M08 (RF18) — public volunteering list at `/voluntariados`. Same contract as
 * `/campanas`: a WRAPPED page read from `.items`, normalized to [] when it is
 * not an array, with an explicit empty state.
 */
function opportunity(
  id: string,
  title: string,
  over: Partial<VolunteerOpportunityPublic> = {},
): VolunteerOpportunityPublic {
  return {
    id,
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    title,
    category: 'Conservación',
    startDate: '2026-11-01T15:00:00.000Z',
    endDate: '2026-11-02T15:00:00.000Z',
    location: 'Finca La Esperanza, Guasca',
    appliesToStudentService: false,
    ...over,
  };
}

function stub(body: unknown) {
  const fetchMock = vi.fn((_url: string) =>
    Promise.resolve({ ok: true, status: 200, json: async () => body }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderList() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PublicVolunteeringPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicVolunteeringPage', () => {
  it('renders a card per active opportunity from the global public feed', async () => {
    const fetchMock = stub({
      items: [
        opportunity('v1', 'Jornada de siembra', { capacity: 20 }),
        opportunity('v2', 'Taller en colegios', { appliesToStudentService: true }),
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });
    renderList();

    const cards = await screen.findAllByTestId('volunteer-opportunity-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Jornada de siembra')).toBeInTheDocument();
    expect(screen.getByText(/20 cupos/)).toBeInTheDocument();
    expect(screen.getByText('Servicio social')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/public/volunteer-opportunities?');
  });

  it('links each card to the authenticated volunteer page to enroll', async () => {
    stub({ items: [opportunity('v1', 'Jornada de siembra')], total: 1, limit: 50, offset: 0 });
    renderList();
    await screen.findByTestId('volunteer-opportunity-card');
    expect(screen.getByRole('link', { name: 'Quiero participar' })).toHaveAttribute(
      'href',
      '/voluntariado',
    );
  });

  it('shows an explicit empty state for a wrapped-empty response', async () => {
    stub({ items: [], total: 0, limit: 50, offset: 0 });
    renderList();
    expect(
      await screen.findByText('No hay voluntariados abiertos ahora. Vuelve pronto.'),
    ).toBeInTheDocument();
  });

  it('T-028c regression: a NON-array body normalizes to [] → empty state, never throws', async () => {
    stub({ items: null, total: 0 });
    renderList();
    expect(
      await screen.findByText('No hay voluntariados abiertos ahora. Vuelve pronto.'),
    ).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) })),
    );
    renderList();
    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument();
  });
});
