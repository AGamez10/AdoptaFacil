import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import {
  ResourceCategory,
  ResourceNeedStatus,
  type ResourceNeedPublic,
} from '@adoptafacil/contracts';
import { PublicResourcesPage } from './public-resources-page';

/**
 * M09 (F-6) — public resource-bank catalog. The endpoint returns a WRAPPED
 * page ({ items, total, limit, offset }); the page reads `.items`,
 * normalizes a non-array to [] and shows an explicit empty state — never
 * `.map` over a non-array (same anti-regression pattern as
 * `PublicCampaignsPage`).
 */
function need(
  id: string,
  title: string,
  over: Partial<ResourceNeedPublic> = {},
): ResourceNeedPublic {
  return {
    id,
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    title,
    category: ResourceCategory.Food,
    quantityNeeded: 20,
    unit: 'kg',
    quantityFulfilled: 0,
    progress: 0,
    status: ResourceNeedStatus.Needed,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function stub(body: unknown, offers: unknown = { items: [], total: 0, limit: 12, offset: 0 }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => (String(input).includes('/open-offers') ? offers : body),
      }),
    ),
  );
}

function renderList() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PublicResourcesPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicResourcesPage', () => {
  it('renders a card per need still accepting help, read from the wrapped `.items`', async () => {
    stub({
      items: [
        need('n1', 'Alimento para gatos', { category: ResourceCategory.Food }),
        need('n2', 'Medicinas para perros', { category: ResourceCategory.Medicine }),
      ],
      total: 2,
      limit: 24,
      offset: 0,
    });
    renderList();

    const cards = await screen.findAllByTestId('need-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Alimento para gatos')).toBeInTheDocument();
    expect(screen.getByText('Medicinas para perros')).toBeInTheDocument();
    expect(screen.getByText('Medicamentos')).toBeInTheDocument();
  });

  it('shows an explicit empty state for a wrapped-empty response', async () => {
    stub({ items: [], total: 0, limit: 24, offset: 0 });
    renderList();
    expect(
      await screen.findByText('Hoy no hay necesidades publicadas, pero lo que tienes sí sirve'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('need-card')).not.toBeInTheDocument();
    // Nadie se va sin un siguiente paso: ofrecimiento abierto + otras formas de ayudar.
    expect(screen.getByRole('link', { name: 'Ofrecer lo que tengo' })).toHaveAttribute(
      'href',
      '/tengo-para-donar',
    );
    expect(screen.getByRole('link', { name: 'Conocer animales' })).toHaveAttribute(
      'href',
      '/adoptar',
    );
    expect(screen.getByRole('link', { name: 'Ver campañas' })).toHaveAttribute('href', '/campanas');
  });

  it('a NON-array body normalizes to [] → empty state, never throws', async () => {
    stub({ items: null, total: 0 });
    renderList();
    expect(
      await screen.findByText('Hoy no hay necesidades publicadas, pero lo que tienes sí sirve'),
    ).toBeInTheDocument();
  });

  it('with needs listed, still invites to offer something that is not on the list', async () => {
    stub({ items: [need('n1', 'Alimento para gatos')], total: 1, limit: 24, offset: 0 });
    renderList();
    expect(await screen.findByText('¿Tienes algo que no está en la lista?')).toBeInTheDocument();
  });

  it('shows the progress read straight from the contract', async () => {
    stub({
      items: [
        need('n1', 'Alimento para gatos', {
          quantityFulfilled: 8,
          quantityNeeded: 20,
          progress: 0.4,
        }),
      ],
      total: 1,
      limit: 24,
      offset: 0,
    });
    renderList();
    await screen.findByTestId('need-card');
    expect(screen.getByTestId('need-progress')).toHaveTextContent('40%');
  });

  it('shows what people are offering (no donor identity) next to the needs', async () => {
    stub(
      { items: [need('n1', 'Alimento para gatos')], total: 1, limit: 24, offset: 0 },
      {
        items: [
          {
            id: 'o1',
            title: 'Cobijas medianas',
            category: ResourceCategory.Supplies,
            quantity: 4,
            unit: 'unidades',
            department: 'Antioquia',
            city: 'Medellín',
            createdAt: '2026-11-01T00:00:00.000Z',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        limit: 12,
        offset: 0,
      },
    );
    renderList();

    const section = await screen.findByTestId('public-open-offers');
    expect(section).toHaveTextContent('Cobijas medianas');
    expect(section).toHaveTextContent('4 unidades');
    expect(section).toHaveTextContent('Medellín, Antioquia');
    expect(screen.getByRole('link', { name: /tomar un ofrecimiento/i })).toHaveAttribute(
      'href',
      '/organizacion/recursos/ofrecimientos',
    );
  });
});
