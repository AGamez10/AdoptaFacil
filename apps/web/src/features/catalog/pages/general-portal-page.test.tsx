import { render, screen, within } from '@testing-library/react';
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeneralPortalPage (landing)', () => {
  it('renders one h1 and a per-page document title', async () => {
    renderLanding();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ayudar a un animal nunca fue tan fácil.' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Adopción responsable en Colombia · AdoptaFácil');
    await screen.findByText('No hay animales en adopción ahora');
  });

  it('the primary CTA anchors to the catalog and the secondary one to the ways to help', async () => {
    renderLanding();
    const hero = screen.getByRole('heading', { level: 1 }).closest('section') as HTMLElement;
    expect(within(hero).getByRole('link', { name: /Quiero adoptar/ })).toHaveAttribute(
      'href',
      '#adoptar',
    );
    expect(within(hero).getByRole('link', { name: 'Otras formas de ayudar' })).toHaveAttribute(
      'href',
      '#ayudar',
    );
    expect(document.getElementById('adoptar')).not.toBeNull();
    expect(document.getElementById('ayudar')).not.toBeNull();
    expect(document.getElementById('organizaciones')).not.toBeNull();
    await screen.findByText('No hay animales en adopción ahora');
  });

  it('only offers the ways to help whose module is on (donar y recursos apagados por defecto)', async () => {
    renderLanding();
    await screen.findByText('No hay animales en adopción ahora');
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
    await screen.findByText('No hay animales en adopción ahora');
    expect(within(screen.getByTestId('way-donar')).getByRole('link')).toHaveAttribute(
      'href',
      '/donaciones',
    );
    expect(within(screen.getByTestId('way-recursos')).getByRole('link')).toHaveAttribute(
      'href',
      '/recursos',
    );
  });

  it('hides the campaigns block when there are no active campaigns', async () => {
    renderLanding();
    await screen.findByText('No hay animales en adopción ahora');
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
    await screen.findByText('No hay animales en adopción ahora');
    expect(screen.queryByTestId('hero-live-total')).not.toBeInTheDocument();
  });

  it('does not promise modules that are off in the MVP (dispersión, libro público, catálogo verificado)', async () => {
    renderLanding();
    await screen.findByText('No hay animales en adopción ahora');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(
      /se dispersa|Libro público|Catálogo verificado|Apadrinamiento mensual/i,
    );
  });

  it('offers the official WhatsApp and e-mail help to organizations without RUT (F20, D10)', async () => {
    renderLanding();
    await screen.findByText('No hay animales en adopción ahora');
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
});
