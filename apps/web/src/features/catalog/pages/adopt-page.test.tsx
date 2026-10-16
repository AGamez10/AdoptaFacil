import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider } from '../../../shell/auth';
import { AdoptPage } from './adopt-page';
import { GeneralPortalPage } from './general-portal-page';

/**
 * Listado público /adoptar (rediseño 2026-10): URLs limpias por especie y
 * ciudad, filtros en la URL, mapa de ciudades y redirección de los enlaces
 * viejos de la landing (`/#adoptar`, `?especie=&ciudad=`).
 */
type Species = 'dog' | 'cat';

function animal(
  id: string,
  name: string,
  species: Species,
  city: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    organizationId: `org-${id}`,
    name,
    species,
    sex: 'female',
    size: 'medium',
    status: 'available',
    photoUrl: `https://example.test/${id}.jpg`,
    createdAt: '2026-09-01T00:00:00.000Z',
    organization: { id: `org-${city}`, name: `Refugio ${city}`, slug: `refugio-${id}`, city },
    ...extra,
  };
}

const ANIMALS = [
  animal('a1', 'Rocco', 'dog', 'Bogotá', { size: 'large', sex: 'male' }),
  animal('a2', 'Luna', 'dog', 'Medellín', { computedAge: { years: 0, months: 6, totalMonths: 6 } }),
  animal('a3', 'Nieve', 'cat', 'Medellín'),
  animal('a4', 'Toby', 'dog', 'Bogotá', { breed: 'Criollo' }),
];

function stubApi() {
  const fetchMock = vi.fn((input: string) => {
    const url = new URL(input);
    const species = url.searchParams.get('species');
    const data = url.pathname.endsWith('/public/animals')
      ? ANIMALS.filter((item) => !species || item.species === species)
      : [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ data, total: data.length, page: 1, limit: 50 }),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(route: string) {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <SessionProvider initialStatus="unauthenticated">
        <Routes>
          <Route path="/" element={<GeneralPortalPage />} />
          <Route path="/adoptar" element={<AdoptPage />} />
          <Route path="/adoptar/:especie" element={<AdoptPage />} />
          <Route path="/adoptar/:especie/:ciudad" element={<AdoptPage />} />
        </Routes>
        <LocationProbe />
      </SessionProvider>
    </MemoryRouter>,
  );
}

const names = () =>
  within(screen.getByTestId('adopt-results'))
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdoptPage (/adoptar)', () => {
  it('lists every adoptable animal with a title and real count', async () => {
    stubApi();
    renderAt('/adoptar');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Perros y gatos en adopción en Colombia' }),
    ).toBeInTheDocument();
    await screen.findByTestId('adopt-results');
    expect(names()).toHaveLength(4);
    expect(screen.getByTestId('adopt-count')).toHaveTextContent('4 animales esperan hogar.');
    expect(document.title).toBe('Perros y gatos en adopción en Colombia · AdoptaFácil');
  });

  it('reads species and city from the clean URL and keeps the real city name', async () => {
    const fetchMock = stubApi();
    renderAt('/adoptar/perros/bogota');
    await screen.findByTestId('adopt-results');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('species=dog');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Perros en adopción en Bogotá' }),
    ).toBeInTheDocument();
    expect(names()).toEqual(['Rocco', 'Toby']);
    const crumbs = screen.getByRole('navigation', { name: 'Ruta de navegación' });
    expect(within(crumbs).getByRole('link', { name: 'Perros' })).toHaveAttribute(
      'href',
      '/adoptar/perros',
    );
  });

  it('sends an unknown species back to the full listing', async () => {
    stubApi();
    renderAt('/adoptar/dinosaurios');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/adoptar$/);
    await screen.findByTestId('adopt-results');
  });

  it('filters by size, sex and age through the URL so the search can be shared', async () => {
    stubApi();
    renderAt('/adoptar/perros?edad=cachorro');
    await screen.findByTestId('adopt-results');
    expect(names()).toEqual(['Luna']);

    fireEvent.change(screen.getByLabelText('Edad'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Tamaño'), { target: { value: 'large' } });
    expect(screen.getByTestId('location')).toHaveTextContent('/adoptar/perros?tamano=large');
    expect(names()).toEqual(['Rocco']);
  });

  it('searches by name or breed, ignoring accents and case', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubApi();
    renderAt('/adoptar');
    await screen.findByTestId('adopt-results');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'CRIÓLLO' } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(names()).toEqual(['Toby']);
    vi.useRealTimers();
  });

  it('shows the cities on the map and picking one moves to its clean URL', async () => {
    stubApi();
    renderAt('/adoptar/animales');
    await screen.findByTestId('adopt-results');
    const map = screen.getByTestId('colombia-map');
    // Medellín tiene 2 (un perro y un gato), Bogotá 2: ambas con su punto en el mapa.
    expect(within(map).getByRole('button', { name: 'Medellín: 2 animales' })).toBeInTheDocument();
    fireEvent.click(within(map).getByRole('button', { name: /^Medellín\s*2$/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/adoptar/animales/medellin');
    expect(names()).toEqual(['Luna', 'Nieve']);
  });

  it('when nothing matches, says so kindly and offers to clear the filters', async () => {
    stubApi();
    renderAt('/adoptar/gatos/cali');
    const empty = await screen.findByTestId('adopt-empty');
    expect(empty).toHaveTextContent('No encontramos animales con esos filtros');
    expect(within(empty).getByRole('link', { name: 'Ver todos' })).toHaveAttribute(
      'href',
      '/adoptar/gatos',
    );
  });
});

describe('landing → /adoptar', () => {
  it('the hero search opens the clean URL for the species and city', async () => {
    stubApi();
    renderAt('/');
    const city = await screen.findByRole('option', { name: 'Medellín' });
    fireEvent.click(screen.getByRole('radio', { name: 'Gatos' }));
    fireEvent.change(city.closest('select') as HTMLSelectElement, {
      target: { value: 'Medellín' },
    });
    fireEvent.submit(screen.getByRole('search', { name: 'Buscar animales' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/adoptar/gatos/medellin');
  });

  it('old landing links keep working and redirect to the listing', async () => {
    stubApi();
    renderAt('/?especie=gatos&ciudad=Medell%C3%ADn');
    expect(screen.getByTestId('location')).toHaveTextContent('/adoptar/gatos/medellin');
    await screen.findByTestId('adopt-results');
    expect(names()).toEqual(['Nieve']);
  });
});
