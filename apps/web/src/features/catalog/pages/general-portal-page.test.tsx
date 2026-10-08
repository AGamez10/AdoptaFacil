import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../../shell/auth';
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
      screen.getByRole('heading', { level: 1, name: 'Adoptar bien empieza por confiar.' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Adopción responsable en Colombia · AdoptaFácil');
    await screen.findByText('No hay animales en adopción ahora');
  });

  it('the primary CTA anchors to the catalog section and the secondary one to registration', async () => {
    renderLanding();
    expect(screen.getByRole('link', { name: /Conocer animales en adopción/ })).toHaveAttribute(
      'href',
      '#adoptar',
    );
    const hero = screen.getByRole('heading', { level: 1 }).closest('section') as HTMLElement;
    expect(within(hero).getByRole('link', { name: 'Registrar mi organización' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(document.getElementById('adoptar')).not.toBeNull();
    expect(document.getElementById('organizaciones')).not.toBeNull();
    await screen.findByText('No hay animales en adopción ahora');
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
