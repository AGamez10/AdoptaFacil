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

  it('the hero offers three clear paths: adopt, help (donar apagado → formas de ayudar) and organizations', async () => {
    renderLanding();
    const hero = screen.getByRole('heading', { level: 1 }).closest('section') as HTMLElement;
    const paths = within(hero).getByRole('navigation', { name: '¿Qué quieres hacer?' });
    expect(within(paths).getAllByRole('link')).toHaveLength(3);
    expect(within(paths).getByRole('link', { name: /Quiero adoptar/ })).toHaveAttribute(
      'href',
      '/adoptar',
    );
    expect(within(paths).getByRole('link', { name: /Quiero ayudar/ })).toHaveAttribute(
      'href',
      '#ayudar',
    );
    expect(within(paths).getByRole('link', { name: /Soy una organización/ })).toHaveAttribute(
      'href',
      '#organizaciones',
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
    expect(within(screen.getByTestId('hero-path-donar')).getByRole('link')).toHaveAttribute(
      'href',
      '/donaciones',
    );
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

  it("with real data, lists open needs, volunteering and each organization's public ledger", async () => {
    const org = { id: 'o1', name: 'Huellas Felices', slug: 'huellas', city: 'Cali' };
    const animal = {
      id: 'a1',
      name: 'Toby',
      species: 'dog',
      organization: org,
      photos: [],
      city: 'Cali',
    };
    const bodies: Record<string, unknown> = {
      '/public/resources/needs': {
        items: [
          {
            id: 'n1',
            organizationId: 'o1',
            organizationName: 'Huellas Felices',
            title: 'Concentrado para cachorros',
            category: 'food',
            quantityNeeded: 10,
            unit: 'bultos',
            quantityFulfilled: 4,
            progress: 0.4,
            status: 'partially_fulfilled',
            createdAt: '2026-10-01T00:00:00Z',
          },
        ],
        total: 1,
        limit: 3,
        offset: 0,
      },
      '/public/volunteer-opportunities': {
        items: [
          {
            id: 'v1',
            organizationId: 'o1',
            organizationName: 'Huellas Felices',
            title: 'Jornada de baño',
            category: 'Cuidado',
            startDate: '2026-11-08T00:00:00Z',
            endDate: '2026-11-09T00:00:00Z',
            capacity: 12,
            location: 'Cali',
            appliesToStudentService: true,
          },
        ],
        total: 1,
      },
      '/public/organizations/huellas/ledger': {
        items: [],
        total: 3,
        limit: 1,
        offset: 0,
        totals: {
          incomeCop: 250000,
          expenseCop: 120000,
          balanceCop: 130000,
          entryCount: 3,
          lastEntryOn: '2026-10-20',
        },
      },
      '/public/animals': { data: [animal], total: 1 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const path = new URL(String(input), 'http://x').pathname;
        const body = bodies[path] ?? { data: [], total: 0 };
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      }),
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
    const needs = await screen.findByTestId('landing-needs');
    expect(
      await within(needs).findByRole('link', { name: /Concentrado para cachorros/ }),
    ).toHaveAttribute('href', '/recursos/n1');
    expect(needs).toHaveTextContent('4 de 10 bultos · 40% cubierto');
    expect(within(needs).getByRole('link', { name: 'Ver el banco de recursos' })).toHaveAttribute(
      'href',
      '/recursos',
    );
    const volunteering = await screen.findByTestId('landing-volunteering');
    expect(await within(volunteering).findByText('Jornada de baño')).toBeVisible();
    expect(volunteering).toHaveTextContent('Servicio social');
    expect(volunteering).toHaveTextContent('12 cupos');
    const ledger = await screen.findByTestId('landing-ledger');
    expect(await within(ledger).findByRole('link', { name: /Huellas Felices/ })).toHaveAttribute(
      'href',
      '/o/huellas#portal-section-public-ledger',
    );
    expect(ledger.textContent?.replace(/\s/g, ' ')).toMatch(/Ingresos.*250\.000/);
  });

  it('keeps the campaigns block with a clear message when there are no active campaigns', async () => {
    renderLanding();
    expect(await screen.findByTestId('landing-campaigns-empty')).toHaveTextContent(
      'Hoy no hay campañas abiertas',
    );
    expect(
      within(screen.getByTestId('landing-campaigns')).getByRole('link', {
        name: 'Ver todas las campañas',
      }),
    ).toHaveAttribute('href', '/campanas');
  });

  it('shows what shelters ask for: resource needs (module off → "Muy pronto") and volunteering', async () => {
    renderLanding();
    await settle();
    const needs = await screen.findByTestId('landing-needs');
    expect(needs).toHaveTextContent('Muy pronto');
    expect(within(needs).queryByRole('link')).not.toBeInTheDocument();
    const volunteering = await screen.findByTestId('landing-volunteering');
    expect(
      await within(volunteering).findByText('Hoy no hay voluntariados abiertos'),
    ).toBeVisible();
    expect(
      within(volunteering).getByRole('link', { name: 'Inscribirme como voluntario' }),
    ).toHaveAttribute('href', '/voluntariado');
  });

  it('links every guide (SEO) and the public ledger of the organizations', async () => {
    renderLanding();
    const guides = await screen.findByTestId('landing-guides');
    expect(
      await within(guides).findByRole('link', { name: /Cómo adoptar un perro en Colombia/ }),
    ).toHaveAttribute('href', '/guias/como-adoptar-un-perro-en-colombia');
    expect(within(guides).getByRole('link', { name: 'Ver todas las guías' })).toHaveAttribute(
      'href',
      '/guias',
    );
    expect(
      await within(await screen.findByTestId('landing-ledger')).findByText(
        'Todavía no hay libros para mostrar',
      ),
    ).toBeVisible();
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

  // El libro público (RF14) ya existe en cada portal; lo demás sigue apagado.
  it('does not promise modules that are off in the MVP (dispersión, catálogo verificado)', async () => {
    renderLanding();
    await settle();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/se dispersa|Catálogo verificado|Apadrinamiento mensual/i);
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

  it('shows the FAQ that also travels as FAQPage JSON-LD', async () => {
    renderLanding();
    const faq = screen.getByTestId('landing-faq');
    expect(within(faq).getByRole('heading', { name: '¿Qué es AdoptaFácil?' })).toBeInTheDocument();
    const ld = [...document.head.querySelectorAll('script[data-seo="ld"]')].map((node) =>
      JSON.parse(node.textContent ?? '{}'),
    );
    expect(ld.map((block) => block['@type'])).toEqual(['Organization', 'WebSite', 'FAQPage']);
    await settle();
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
});
