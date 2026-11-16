import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicAdoptionNetwork, PublicAnimalSummary } from '@adoptafacil/contracts';
import { saveCookieConsent } from '../../../shell/consent';
import type { CatalogSnapshot } from '../model/use-catalog-snapshot';
import { resetFeaturedCoffeeForTests } from '../model/use-featured-coffee';
import { COFFEE_TEASER_DELAY_MS, COFFEE_TEASER_VISIBLE_MS, CoffeeTeaser } from './coffee-teaser';
import { ImpactSection } from './landing-sections';
import { CoffeeSection } from './landing-showcase';

const router = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

function animal(i: number, orgId: string): PublicAnimalSummary {
  return {
    id: `a-${i}`,
    organizationId: orgId,
    name: `Animal ${i}`,
    species: 'dog',
    sex: 'female',
    size: 'medium',
    status: 'available',
    computedAge: { years: 1, months: 0 },
    isActive: true,
    createdAt: '2026-11-01T00:00:00Z',
    photoUrl: `/foto-${i}.jpg`,
    organization: { id: orgId, name: `Org ${orgId}`, slug: `org-${orgId}`, city: 'Bogotá' },
  } as PublicAnimalSummary;
}

function snapshot(animals: PublicAnimalSummary[], total: number): CatalogSnapshot {
  return {
    status: 'ready',
    animals,
    total,
    organizations: [...new Map(animals.map((a) => [a.organization.id, a.organization])).values()],
    cities: [{ city: 'Bogotá', count: animals.length }],
  };
}

const NETWORK: PublicAdoptionNetwork = {
  animals: 136,
  organizations: 9,
  cities: [
    { city: 'Bogotá', count: 80 },
    { city: 'Medellín', count: 56 },
  ],
  items: [
    {
      id: 'o1',
      name: 'Refugio Patitas Felices',
      slug: 'patitas-felices',
      city: 'Bogotá',
      animals: 80,
      photos: ['/p1.jpg', '/p2.jpg', '/p3.jpg'],
    },
    { id: 'o2', name: 'canino077', slug: 'canino077', city: 'Guatavita', animals: 1, photos: [] },
  ],
};

function stubFetch(routes: Record<string, unknown>) {
  const fetchMock = vi.fn((url: string) => {
    const key = Object.keys(routes).find((path) => url.includes(path));
    if (!key || routes[key] === undefined) {
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => routes[key] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetFeaturedCoffeeForTests();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Rescatistas de todo el país', () => {
  it('muestra las cifras de TODA la red, las organizaciones con fotos y las ciudades', async () => {
    stubFetch({ '/public/network': NETWORK });
    // La primera página del catálogo trae solo 2 de 136 animales.
    render(
      <MemoryRouter future={router}>
        <ImpactSection snapshot={snapshot([animal(1, 'x'), animal(2, 'x')], 136)} />
      </MemoryRouter>,
    );
    await settle();
    const section = screen.getByTestId('landing-impact');
    expect(within(section).getByText('refugios y rescatistas')).toBeInTheDocument();
    const cards = within(section).getAllByTestId('network-org');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('href', '/o/patitas-felices');
    expect(cards[0]).toHaveTextContent('80 animales en adopción · Bogotá');
    expect(cards[1]).toHaveTextContent('1 animal en adopción · Guatavita');
    expect(within(section).getByRole('link', { name: /Medellín/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/adoptar'),
    );
    expect(within(section).getByRole('link', { name: /Rescatas animales/ })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('sin la red completa no inventa cuántos animales tiene cada organización', async () => {
    stubFetch({});
    render(
      <MemoryRouter future={router}>
        <ImpactSection snapshot={snapshot([animal(1, 'x'), animal(2, 'y')], 136)} />
      </MemoryRouter>,
    );
    await settle();
    const cards = screen.getAllByTestId('network-org');
    expect(cards[0]).toHaveTextContent('Animales en adopción');
    expect(cards[0]).not.toHaveTextContent(/\d animal/);
    // Ni organizaciones ni ciudades: solo serían las de la primera página.
    expect(screen.queryByText('refugios y rescatistas')).not.toBeInTheDocument();
    expect(screen.queryByText('Busca cerca de ti')).not.toBeInTheDocument();
  });
});

describe('Café en la landing', () => {
  it('con un lote a la venta, "Comprar café" abre la página de compra del QR', async () => {
    stubFetch({ '/public/coffee/destacado': { code: 'cafe2345' } });
    render(
      <MemoryRouter future={router}>
        <CoffeeSection />
      </MemoryRouter>,
    );
    await settle();
    expect(screen.getByTestId('coffee-buy')).toHaveAttribute('href', '/c/cafe2345');
  });

  it('sin lote a la venta no ofrece comprar', async () => {
    stubFetch({ '/public/coffee/destacado': { code: null } });
    render(
      <MemoryRouter future={router}>
        <CoffeeSection />
      </MemoryRouter>,
    );
    await settle();
    expect(screen.queryByTestId('coffee-buy')).not.toBeInTheDocument();
    expect(screen.getByText(/La venta en línea abre con el próximo lote/)).toBeInTheDocument();
  });
});

describe('Aviso del café al entrar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  const renderTeaser = () =>
    render(
      <MemoryRouter future={router}>
        <CoffeeTeaser />
      </MemoryRouter>,
    );

  it('espera la decisión de cookies, aparece, lleva a comprar y se va solo', async () => {
    stubFetch({ '/public/coffee/destacado': { code: 'cafe2345' } });
    renderTeaser();
    await act(async () => {
      vi.advanceTimersByTime(COFFEE_TEASER_DELAY_MS + 100);
    });
    expect(screen.queryByTestId('coffee-teaser')).not.toBeInTheDocument();

    act(() => {
      saveCookieConsent({ statistics: false, marketing: false });
    });
    await act(async () => {
      vi.advanceTimersByTime(COFFEE_TEASER_DELAY_MS + 100);
    });
    const teaser = screen.getByTestId('coffee-teaser');
    expect(teaser).toHaveTextContent('gratis para refugios y fundaciones');
    await settle();
    expect(screen.getByTestId('coffee-teaser-cta')).toHaveAttribute('href', '/c/cafe2345');

    await act(async () => {
      vi.advanceTimersByTime(COFFEE_TEASER_VISIBLE_MS + 100);
    });
    expect(screen.getByTestId('coffee-teaser')).toHaveAttribute('data-phase', 'leaving');
  });

  it('sale una sola vez por sesión', async () => {
    stubFetch({ '/public/coffee/destacado': { code: null } });
    saveCookieConsent({ statistics: false, marketing: false });
    const first = renderTeaser();
    await act(async () => {
      vi.advanceTimersByTime(COFFEE_TEASER_DELAY_MS + 100);
    });
    expect(screen.getByTestId('coffee-teaser-cta')).toHaveTextContent('Conocer el café');
    first.unmount();

    renderTeaser();
    await act(async () => {
      vi.advanceTimersByTime(COFFEE_TEASER_DELAY_MS + 100);
    });
    expect(screen.queryByTestId('coffee-teaser')).not.toBeInTheDocument();
  });
});
