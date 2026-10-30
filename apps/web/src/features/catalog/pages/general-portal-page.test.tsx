import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../../shell/auth';
import { CapabilitiesProvider } from '../../../shell/capabilities';
import { OPEN_CAPABILITIES } from '../../../test-utils';
import { GeneralPortalPage } from './general-portal-page';

/**
 * Landing pública (Ola 3, R3-5 · F4/F5). El comportamiento del catálogo y la
 * redirección con sesión ya los cubren routing.test.tsx y
 * general-catalog-section.test.tsx; aquí se fija el contenido real del hero,
 * sus anclas y que ningún texto prometa algo que el MVP no tiene encendido.
 */
function renderLanding(total = 0) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [], total }) }),
    ),
  );
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionProvider initialStatus="unauthenticated">
        <GeneralPortalPage />
      </SessionProvider>
    </MemoryRouter>,
  );
}

/** Deja que terminen las lecturas de la API (sin animales no aparece nada nuevo que esperar). */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeneralPortalPage (landing)', () => {
  it('renders one h1 and a per-page document title', async () => {
    renderLanding();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Adopta un amigo. Cambia dos vidas.' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Adopción de perros y gatos en Colombia · AdoptaFácil');
    await settle();
  });

  it('the primary CTA leads to the adoption listing and the secondary one to the ways to help', async () => {
    renderLanding();
    const hero = screen.getByRole('heading', { level: 1 }).closest('section') as HTMLElement;
    expect(within(hero).getByRole('link', { name: /Quiero adoptar/ })).toHaveAttribute(
      'href',
      '/adoptar',
    );
    expect(within(hero).getByRole('link', { name: 'Otras formas de ayudar' })).toHaveAttribute(
      'href',
      '#ayudar',
    );
    expect(document.getElementById('ayudar')).not.toBeNull();
    expect(document.getElementById('organizaciones')).not.toBeNull();
    await settle();
  });

  it('only offers the ways to help whose module is on (donar y recursos apagados por defecto)', async () => {
    renderLanding();
    await settle();
    expect(screen.getByTestId('way-adoptar')).toBeInTheDocument();
    expect(screen.getByTestId('way-campanas')).toBeInTheDocument();
    expect(screen.queryByTestId('way-donar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('way-recursos')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Donar/ })).not.toBeInTheDocument();
  });

  it('with payments and resources on, offers donating and the resource bank too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [], total: 0 }) }),
      ),
    );
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CapabilitiesProvider value={OPEN_CAPABILITIES}>
          <SessionProvider initialStatus="unauthenticated">
            <GeneralPortalPage />
          </SessionProvider>
        </CapabilitiesProvider>
      </MemoryRouter>,
    );
    await settle();
    expect(within(screen.getByTestId('way-donar')).getByRole('link')).toHaveAttribute(
      'href',
      '/donaciones',
    );
    expect(within(screen.getByTestId('way-recursos')).getByRole('link')).toHaveAttribute(
      'href',
      '/recursos',
    );
    const community = screen.getByTestId('landing-community');
    expect(within(community).queryByText(/muy pronto/i)).not.toBeInTheDocument();
    expect(within(community).getByRole('link', { name: /Ver servicios/ })).toHaveAttribute(
      'href',
      '/servicios',
    );
    expect(
      within(community).getByRole('link', { name: 'Tengo un negocio para mascotas' }),
    ).toHaveAttribute('href', '/mi-negocio');
  });

  it('hides the campaigns block when there are no active campaigns', async () => {
    renderLanding();
    await settle();
    expect(screen.queryByTestId('landing-campaigns')).not.toBeInTheDocument();
  });

  it('shows the live total from the API and never a fabricated counter', async () => {
    renderLanding(7);
    expect(await screen.findByTestId('hero-live-total')).toHaveTextContent(
      '7 animales esperan hogar hoy',
    );
    expect(screen.queryByText(/adopciones formalizadas/)).not.toBeInTheDocument();
  });

  it('hides the live total when there is nothing real to show', async () => {
    renderLanding(0);
    await settle();
    expect(screen.queryByTestId('hero-live-total')).not.toBeInTheDocument();
  });

  it('does not promise modules that are off in the MVP (dispersión, libro público, catálogo verificado)', async () => {
    renderLanding();
    await settle();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(
      /se dispersa|Libro público|Catálogo verificado|Apadrinamiento mensual/i,
    );
  });

  it('offers the official WhatsApp and e-mail help to organizations without RUT (F20, D10)', async () => {
    renderLanding();
    await settle();
    const help = screen
      .getByRole('heading', { name: '¿Aún no tienes RUT o cámara de comercio?' })
      .closest('aside') as HTMLElement;
    expect(within(help).getByTestId('contact-whatsapp').getAttribute('href')).toMatch(
      /^https:\/\/wa\.me\/573028528926\?text=/,
    );
    expect(within(help).getByTestId('contact-email').getAttribute('href')).toMatch(
      /^mailto:adoptafacil\.oficial@gmail\.com\?subject=/,
    );
  });

  it('with real animals, shows them first: hero collage, faces and the "Te están esperando" rail', async () => {
    const animal = (id: string, name: string, city: string) => ({
      id,
      organizationId: `org-${city}`,
      name,
      species: 'dog',
      sex: 'male',
      size: 'large',
      status: 'available',
      photoUrl: `https://example.test/${id}.jpg`,
      organization: { id: `org-${city}`, name: `Refugio ${city}`, slug: `refugio-${city}`, city },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: [animal('a1', 'Rocco', 'Bogotá'), animal('a2', 'Luna', 'Cali')],
            total: 2,
          }),
        }),
      ),
    );
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SessionProvider initialStatus="unauthenticated">
          <GeneralPortalPage />
        </SessionProvider>
      </MemoryRouter>,
    );
    const collage = await screen.findByTestId('hero-collage');
    expect(within(collage).getByRole('link', { name: /Rocco/ })).toHaveAttribute(
      'href',
      '/o/refugio-Bogot%C3%A1/animales/a1',
    );
    expect(screen.getByTestId('hero-avatars')).toHaveTextContent('Rocco, Luna te esperan');
    expect(
      within(screen.getByTestId('landing-waiting')).getAllByTestId('animal-spotlight-card'),
    ).toHaveLength(2);
    // Cifras reales: 2 animales, 2 organizaciones, 2 ciudades.
    const impact = screen.getByTestId('landing-impact');
    expect(within(impact).getByText('animales buscando hogar').nextSibling).toHaveTextContent('2');
    // El buscador del hero ofrece solo ciudades con animales publicados.
    const city = screen.getByRole('combobox', { name: 'Ciudad' });
    expect(
      within(city)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Todo Colombia', 'Bogotá', 'Cali']);
  });

  it('without animals, hides the rail and the live figures instead of showing zeros', async () => {
    renderLanding();
    await settle();
    expect(screen.queryByTestId('landing-waiting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('landing-impact')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hero-collage')).not.toBeInTheDocument();
  });

  it('announces the community as coming soon and only asks businesses to write on WhatsApp', async () => {
    renderLanding();
    await settle();
    const community = screen.getByTestId('landing-community');
    expect(within(community).getByText(/muy pronto/i)).toBeInTheDocument();
    expect(
      within(community)
        .getByRole('link', { name: /Tengo un negocio para mascotas/ })
        .getAttribute('href'),
    ).toMatch(/^https:\/\/wa\.me\/573028528926\?text=/);
  });

  it('shows the same optional plans and prices as the plans screen, flagging what is not built yet', async () => {
    renderLanding();
    await settle();
    expect(
      within(screen.getByTestId('plan-free')).getByText('Gratis, siempre'),
    ).toBeInTheDocument();
    const crece = within(screen.getByTestId('plan-crece'));
    expect(crece.getByText('$39.000 al mes')).toBeInTheDocument();
    expect(crece.getByText(/Opcional/)).toBeInTheDocument();
    expect(crece.getByText('Todo lo del plan Gratis')).toBeInTheDocument();
    expect(crece.getByText('Hasta 10 personas del equipo')).toBeInTheDocument();
    const pro = within(screen.getByTestId('plan-pro'));
    expect(pro.getByText('$79.000 al mes')).toBeInTheDocument();
    expect(pro.getByText('Dominio propio (www.turefugio.org)')).toBeInTheDocument();
    expect(pro.getAllByText('Próximamente').length).toBeGreaterThan(0);
    expect(screen.getByTestId('landing-plans').textContent).not.toMatch(/Muy pronto/);
  });
  describe('jornadas de voluntariado y necesidades del banco de recursos', () => {
    const opportunity = {
      id: 'op-1',
      organizationId: 'org-1',
      organizationName: 'Refugio Uno',
      title: 'Jornada de baño',
      description: 'Bañamos a los perritos del refugio.',
      category: 'Cuidado',
      startDate: '2026-11-07T14:00:00.000Z',
      endDate: '2026-11-07T20:00:00.000Z',
      capacity: 12,
      location: 'Bogotá',
      appliesToStudentService: true,
    };
    const need = {
      id: 'need-1',
      organizationId: 'org-1',
      organizationName: 'Refugio Uno',
      title: 'Cobijas para el invierno',
      category: 'supplies',
      quantityNeeded: 20,
      unit: 'unidades',
      quantityFulfilled: 5,
      progress: 0.25,
      status: 'partially_fulfilled',
      createdAt: '2026-10-01T00:00:00.000Z',
    };

    function stubApi() {
      const fetchMock = vi.fn((url: string) => {
        const body = url.includes('/public/volunteer-opportunities')
          ? { items: [opportunity], total: 1, limit: 3, offset: 0 }
          : url.includes('/public/resources/needs')
            ? { items: [need], total: 1, limit: 3, offset: 0 }
            : { data: [], total: 0, items: [] };
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    function renderWith(capabilities?: typeof OPEN_CAPABILITIES) {
      const page = (
        <SessionProvider initialStatus="unauthenticated">
          <GeneralPortalPage />
        </SessionProvider>
      );
      return render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {capabilities ? (
            <CapabilitiesProvider value={capabilities}>{page}</CapabilitiesProvider>
          ) : (
            page
          )}
        </MemoryRouter>,
      );
    }

    it('shows open volunteering days with a link to sign up for that one', async () => {
      stubApi();
      renderWith();
      const section = await screen.findByTestId('landing-volunteering');
      expect(within(section).getByText('Jornada de baño')).toBeInTheDocument();
      expect(within(section).getByText('Refugio Uno')).toBeInTheDocument();
      expect(within(section).getByText('Cuenta como servicio social')).toBeInTheDocument();
      expect(within(section).getByRole('link', { name: 'Quiero participar' })).toHaveAttribute(
        'href',
        '/voluntariado?oportunidad=op-1',
      );
    });

    it('with the resource bank on, shows needs linked to their public detail', async () => {
      stubApi();
      renderWith(OPEN_CAPABILITIES);
      const section = await screen.findByTestId('landing-needs');
      expect(within(section).getByText('Cobijas para el invierno')).toBeInTheDocument();
      expect(within(section).getByText('5 de 20')).toBeInTheDocument();
      expect(within(section).getByRole('link', { name: 'Quiero ayudar' })).toHaveAttribute(
        'href',
        '/recursos/need-1',
      );
    });

    it('with the resource bank off, never asks the API for needs nor shows the block', async () => {
      const fetchMock = stubApi();
      renderWith();
      await screen.findByTestId('landing-volunteering');
      expect(screen.queryByTestId('landing-needs')).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/resources/needs'))).toBe(
        false,
      );
    });

    it('without open days or needs, neither block appears', async () => {
      renderLanding();
      await settle();
      expect(screen.queryByTestId('landing-volunteering')).not.toBeInTheDocument();
      expect(screen.queryByTestId('landing-needs')).not.toBeInTheDocument();
    });
  });
});
