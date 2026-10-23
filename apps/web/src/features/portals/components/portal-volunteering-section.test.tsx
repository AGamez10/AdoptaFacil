import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { PortalVolunteeringSection } from './portal-volunteering-section';

const OPPORTUNITY: VolunteerOpportunityPublic = {
  id: 'v1',
  organizationId: 'org-1',
  organizationName: 'Refugio Patitas',
  title: 'Limpieza de quebrada',
  category: 'Conservación',
  startDate: '2026-11-01T15:00:00.000Z',
  endDate: '2026-11-01T20:00:00.000Z',
  location: 'Vereda El Salitre',
  appliesToStudentService: false,
};

function stub(body: unknown) {
  const fetchMock = vi.fn((_url: string) =>
    Promise.resolve({ ok: true, status: 200, json: async () => body }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSection() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PortalVolunteeringSection slug="patitas" />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalVolunteeringSection', () => {
  it("lists the organization's active opportunities fetched by slug", async () => {
    const fetchMock = stub({ items: [OPPORTUNITY], total: 1, limit: 12, offset: 0 });
    renderSection();
    expect(await screen.findByText('Limpieza de quebrada')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/public/organizations/patitas/volunteer-opportunities',
    );
  });

  it('shows an explicit empty message when there are none', async () => {
    stub({ items: [], total: 0, limit: 12, offset: 0 });
    renderSection();
    expect(
      await screen.findByText('Esta organización no tiene voluntariados abiertos por ahora.'),
    ).toBeInTheDocument();
  });

  it('exposes the heading anchor used by the portal nav', async () => {
    stub({ items: [], total: 0, limit: 12, offset: 0 });
    renderSection();
    expect(await screen.findByRole('heading', { name: 'Voluntariado' })).toHaveAttribute(
      'id',
      'portal-section-volunteering',
    );
  });
});
