import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceCategory, type ServiceListingPublic } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

function listing(id: string, over: Partial<ServiceListingPublic> = {}): ServiceListingPublic {
  return {
    id,
    category: ServiceCategory.Veterinary,
    name: 'Clínica Huellitas',
    department: 'Antioquia',
    city: 'Medellín',
    ratingAverage: 4.5,
    ratingCount: 2,
    isPartner: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

function stubFetch(handler: (url: string) => unknown) {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const body = handler(String(input));
    return Promise.resolve({
      ok: body !== null,
      status: body === null ? 404 : 200,
      headers: { get: () => null },
      json: async () => body,
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServicesDirectoryPage — directorio público', () => {
  it('lists approved services without a session and filters by type and city', async () => {
    const fetchMock = stubFetch(() => ({
      items: [
        listing('s1'),
        listing('s2', { name: 'Peluquería Guau', category: ServiceCategory.Grooming }),
      ],
      total: 2,
      limit: 24,
      offset: 0,
    }));
    renderShell({ route: '/servicios' });

    expect(await screen.findAllByTestId('service-card')).toHaveLength(2);
    expect(screen.getByText('2 servicios')).toBeInTheDocument();
    expect(screen.getAllByText('4,5 ★ · 2 reseñas')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Peluquerías' }));
    await waitFor(() =>
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('category=grooming'),
    );

    fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'Cali' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('city=Cali'));
  });

  it('shows the partner badge on partners and "Perfil revisado" on the rest', async () => {
    stubFetch(() => ({
      items: [listing('s1', { isPartner: true, name: 'Aliada' }), listing('s2')],
      total: 2,
      limit: 24,
      offset: 0,
    }));
    renderShell({ route: '/servicios' });
    const cards = await screen.findAllByTestId('service-card');
    expect(cards[0]).toHaveTextContent('Aliado AdoptaFácil');
    expect(cards[1]).toHaveTextContent('Perfil revisado');
    expect(cards[1]).not.toHaveTextContent('Aliado AdoptaFácil');
  });

  it('an empty directory invites businesses; an empty filter suggests another search', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 24, offset: 0 }));
    renderShell({ route: '/servicios' });
    expect(
      await screen.findByText('Muy pronto verás aquí los primeros servicios'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Prueba con otra ciudad/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Peluquerías' }));
    expect(
      await screen.findByText('Prueba con otra ciudad u otro tipo de servicio.'),
    ).toBeInTheDocument();
  });

  it('shows the detail with contact, reviews and nearby adoptable animals', async () => {
    stubFetch((url) => {
      if (url.includes('/reviews')) {
        return {
          items: [{ id: 'r1', rating: 5, authorName: 'Ana', comment: 'Excelente', createdAt: '' }],
          total: 1,
          limit: 20,
          offset: 0,
        };
      }
      if (url.includes('/public/animals')) return { data: [], total: 0, page: 1, limit: 4 };
      return listing('s1', { whatsapp: '3001234567', isPartner: true });
    });
    renderShell({ route: '/servicios/s1' });

    expect(await screen.findByRole('heading', { name: 'Clínica Huellitas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Escribir por WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/573001234567',
    );
    expect(screen.getByText('Aliado AdoptaFácil')).toBeInTheDocument();
    expect(await screen.findByText('Excelente')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Animales en adopción en Medellín' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toBeInTheDocument();
  });

  it('a profile that is not public shows a clear message', async () => {
    stubFetch(() => null);
    renderShell({ route: '/servicios/oculto' });
    expect(await screen.findByText('Este perfil no está disponible')).toBeInTheDocument();
  });
});
