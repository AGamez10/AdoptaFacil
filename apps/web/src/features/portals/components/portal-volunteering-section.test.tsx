import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PortalVolunteeringSection } from './portal-volunteering-section';

const opportunity = {
  id: 'op-1',
  organizationId: 'org-1',
  organizationName: 'Refugio Patitas',
  title: 'Jornada de paseo',
  category: 'Animales',
  startDate: '2027-01-10T00:00:00.000Z',
  endDate: '2027-01-20T00:00:00.000Z',
  location: 'Bogotá',
  appliesToStudentService: true,
};

function stub(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
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
  it('muestra las jornadas abiertas de la organización', async () => {
    stub({ items: [opportunity], total: 1, limit: 12, offset: 0 });
    renderSection();
    expect(await screen.findByText('Jornada de paseo')).toBeInTheDocument();
    expect(screen.getByText('Servicio social')).toBeInTheDocument();
  });

  it('no se monta cuando la organización no tiene jornadas', async () => {
    stub({ items: [], total: 0, limit: 12, offset: 0 });
    renderSection();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId('portal-volunteering-section')).not.toBeInTheDocument(),
    );
  });
});
