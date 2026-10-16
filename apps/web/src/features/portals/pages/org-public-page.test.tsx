import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOSED_CAPABILITIES,
  FormalizationState,
  Role,
  type OrganizationPublic,
} from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * Public rich portal `/o/:slug` (§M14, T-026/T-027). The page fetches the org
 * public projection AND its brand theme with bare `fetch` (no auth); tests stub
 * `fetch` per case, routing by URL (the theme endpoint ends with `/theme`).
 */

const ORG: OrganizationPublic = {
  id: 'org-1',
  name: 'Refugio Patitas',
  slug: 'patitas',
  description: 'Rescatamos y damos en adopción animales en Bogotá.',
  contactEmail: 'hola@patitas.org',
  whatsapp: '+57 300 000 0000',
  location: { city: 'Bogotá', department: 'Cundinamarca', country: 'Colombia' },
  socialLinks: { website: 'https://patitas.org' },
  rteVigente: true,
  formalizationState: FormalizationState.Formalizada,
  verificationLevel: { level: 2, criteria: ['identidad'] },
  nit: '900123456-7',
};

interface StubOptions {
  org?: unknown;
  orgStatus?: number;
  orgOk?: boolean;
  theme?: Record<string, unknown>;
  logoPosition?: string;
  socialNavPosition?: string;
}

function stubFetch({
  org = ORG,
  orgStatus = 200,
  orgOk = true,
  theme = {},
  logoPosition,
  socialNavPosition,
}: StubOptions = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/theme')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ tokens: theme, logoPosition, socialNavPosition }),
        });
      }
      return Promise.resolve({ ok: orgOk, status: orgStatus, json: async () => org });
    }),
  );
}

const PUBLIC_SESSION = { session: { initialStatus: 'unauthenticated' as const } };

beforeEach(() => {
  // Default: a valid org. Individual tests override for 404 / error / theme cases.
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrgPublicPage — rich public portal', () => {
  it('renders the real profile for a valid slug; NO org-type badge when the type is absent', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

    // Profile identity + badges. The projection carries no organizationType (e.g.
    // informal org under the formalized_only policy) → deny-by-default: no badge.
    expect(await screen.findByRole('heading', { name: /Refugio Patitas/ })).toBeInTheDocument();
    expect(screen.queryByTestId('org-type-badge')).not.toBeInTheDocument();
    // Ola 3 (R3-5): formalization and RTE are self-declared today (SEC-003,
    // R2-2), so the portal never paints them as a seal.
    expect(screen.queryByText('RTE vigente')).not.toBeInTheDocument();
    expect(screen.queryByText('Formalizada')).not.toBeInTheDocument();
    expect(screen.queryByText(/Verificación nivel/)).not.toBeInTheDocument();
    expect(document.title).toBe('Refugio Patitas · AdoptaFácil');
  });

  it('shows the org-type badge with its label when the projection carries the type (T-030)', async () => {
    stubFetch({ org: { ...ORG, organizationType: 'shelter' } });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

    await screen.findByRole('heading', { name: /Refugio Patitas/ });
    expect(screen.getByTestId('org-type-badge')).toHaveTextContent('Refugio');
  });

  it('shows a public "Donar" CTA linking to the donation flow with the org resolved (T-051)', async () => {
    // Public portal (unauthenticated): the CTA is visible and points at the donate
    // route carrying the org by query param (the mechanism DonatePage expects). The
    // route's own RequireAuth guard is what enforces sign-in on activation.
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    const cta = screen.getByTestId('portal-donate-cta');
    const href = cta.getAttribute('href') ?? '';
    expect(href).toContain('/donaciones?');
    expect(href).toContain('organizationId=org-1');
    expect(href).toContain('organizationName=Refugio+Patitas');
  });

  it('when the org cannot receive donations yet, the hero hides "Donar" and "Cómo ayudar" shows a warm message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith('/theme')
          ? { tokens: {} }
          : url.includes('/availability')
            ? { canReceiveDonations: false }
            : ORG;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      }),
    );
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    const notice = await screen.findByTestId('portal-donate-activating');
    expect(notice).toHaveTextContent('Este refugio está activando sus donaciones en línea.');
    expect(screen.queryByTestId('portal-donate-cta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-help-cta-donate')).not.toBeInTheDocument();
    expect(
      within(notice).getByRole('button', { name: 'Conocer a sus animales en adopción' }),
    ).toBeInTheDocument();
  });

  it('the "Donar" CTA carries the portal slug so the donation page can link back', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });
    expect(screen.getByTestId('portal-donate-cta').getAttribute('href')).toContain(
      'organizationSlug=patitas',
    );
  });

  it('F2-03: the "Donar" CTA also carries city/NIT (both real, already public on this same page)', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    const href = screen.getByTestId('portal-donate-cta').getAttribute('href') ?? '';
    expect(href).toContain(`organizationCity=${encodeURIComponent('Bogotá')}`);
    expect(href).toContain('organizationNit=900123456-7');
  });

  it('F2-03: omits city/NIT/logo from the "Donar" CTA when the org does not have them (never fabricated)', async () => {
    const { nit: _nit, location: _location, ...withoutExtras } = ORG;
    stubFetch({ org: withoutExtras });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    const href = screen.getByTestId('portal-donate-cta').getAttribute('href') ?? '';
    expect(href).not.toContain('organizationCity');
    expect(href).not.toContain('organizationNit');
    expect(href).not.toContain('organizationLogoUrl');
  });

  it('does NOT mount the still-placeholder aggregated sections (no empty "Próximamente")', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    // Pulido visual (T-D02): transparencia has NO owning module yet (status
    // stays 'placeholder' forever until one exists) — showing an empty
    // "Próximamente" card in front of the client reads as unfinished, so that
    // section is simply not mounted. 'pets' (T-052), 'products'
    // (F-MKT-PORTAL-1), 'needsToday' (F-NEEDS-PORTAL-1) and 'activeCampaign'
    // (F-CAMPANAS-PORTAL-2, S2-07) are LIVE and always show.
    expect(screen.queryByRole('heading', { name: 'Transparencia' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mascotas en adopción' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Productos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Necesita hoy' })).toBeInTheDocument();
  });

  it('Ola 1/3: with every module off it shows no money, products, needs, reviews nor ledger', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION, capabilities: CLOSED_CAPABILITIES });
    await screen.findByRole('heading', { level: 1, name: 'Refugio Patitas' });

    expect(screen.queryByTestId('portal-donate-cta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('public-header-donate')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apadrinar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Productos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Necesita hoy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reseñas' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-public-ledger-section')).not.toBeInTheDocument();
    // The closing block explains how to adopt instead of asking for money.
    expect(
      screen.getByRole('heading', { name: 'Cómo adoptar en Refugio Patitas' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('public-header-adopt')).toHaveAttribute(
      'href',
      '#portal-section-pets',
    );
  });

  it('offers the org WhatsApp as a safe wa.me link built from digits only', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });
    expect(screen.getByTestId('portal-whatsapp-cta').getAttribute('href')).toMatch(
      /^https:\/\/wa\.me\/573000000000\?text=/,
    );
  });

  it('F-MKT-PORTAL-1: mounts the "Productos" section wired to the marketplace catalog scoped to THIS organization', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/theme')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: {} }) });
        }
        if (url.includes('/marketplace/products')) {
          expect(url).toContain('organizationId=org-1');
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 'p1',
                  organizationId: 'org-1',
                  organizationName: 'Refugio Patitas',
                  name: 'Correa reflectiva',
                  category: 'accessories',
                  price: 25_000,
                  stock: 5,
                  images: [],
                  createdAt: '2026-07-01T00:00:00.000Z',
                },
              ],
              total: 1,
              limit: 12,
              offset: 0,
            }),
          });
        }
        if (url.includes('/animals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ items: [], total: 0, limit: 1, offset: 0 }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
      }),
    );
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(await screen.findByText('Correa reflectiva')).toBeInTheDocument();
    expect(screen.getByTestId('product-card')).toBeInTheDocument();
  });

  it('F-NEEDS-PORTAL-1: mounts the "Necesita hoy" section wired to the resource bank scoped to THIS organization', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/theme')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: {} }) });
        }
        if (url.includes('/resources/needs')) {
          expect(url).toContain('organizationId=org-1');
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 'n1',
                  organizationId: 'org-1',
                  organizationName: 'Refugio Patitas',
                  title: 'Alimento para gatos',
                  category: 'food',
                  quantityNeeded: 20,
                  unit: 'kg',
                  quantityFulfilled: 5,
                  progress: 0.25,
                  status: 'partially_fulfilled',
                  createdAt: '2026-07-01T00:00:00.000Z',
                },
              ],
              total: 1,
              limit: 12,
              offset: 0,
            }),
          });
        }
        if (url.includes('/marketplace/products') || url.includes('/animals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ items: [], total: 0, limit: 1, offset: 0 }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
      }),
    );
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(await screen.findByText('Alimento para gatos')).toBeInTheDocument();
    expect(screen.getByTestId('need-card')).toBeInTheDocument();
  });

  it('F-CAMPANAS-PORTAL-2: mounts the "Campaña activa" section wired to real data from the org-scoped feed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/theme')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: {} }) });
        }
        if (url.includes('/campaigns')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 'c1',
                  organizationId: 'org-1',
                  organizationName: 'Refugio Patitas',
                  title: 'Vacunas para el invierno',
                  category: 'medications',
                  goalAmount: 1_000_000,
                  raisedAmount: 250_000,
                  progress: 0.25,
                  deadline: '2027-01-01T00:00:00.000Z',
                  status: 'active',
                  createdAt: '2026-07-01T00:00:00.000Z',
                },
              ],
              total: 1,
              limit: 12,
              offset: 0,
            }),
          });
        }
        if (url.includes('/animals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ items: [], total: 0, limit: 1, offset: 0 }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
      }),
    );
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(await screen.findByText('Vacunas para el invierno')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-card')).toBeInTheDocument();
  });

  it('shows only the documents the PLATFORM reviewed as trust seals (no self-declared level bar)', async () => {
    stubFetch({
      org: {
        ...ORG,
        verificationLevel: {
          level: 2,
          criteria: ['rut:approved', 'existence_representation_certificate:approved', 'x:y'],
        },
      },
    });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(screen.queryByTestId('transparency-indicator')).not.toBeInTheDocument();
    const seals = screen.getByRole('list', { name: 'Documentos revisados por la plataforma' });
    expect(within(seals).getAllByRole('listitem')).toHaveLength(2);
    expect(seals).toHaveTextContent('RUT revisado por AdoptaFácil');
  });

  it('applies the org brand tokens at runtime, scoped and safe-subset only', async () => {
    // `radius`/`secondary` are NOT in the safe subset (T-PERSONALIZACION-AUDIT:
    // removed — neither ever painted anything in the real portal), so they're
    // filtered out exactly like any other unknown key (`font-sans` below).
    stubFetch({
      theme: {
        primary: '24 90% 45%',
        radius: '0.5rem',
        secondary: '213 20% 93%',
        'font-sans': 'url(evil)',
      },
    });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    const main = screen.getByRole('main');
    // Safe tokens are applied as scoped CSS custom properties…
    expect(main.style.getPropertyValue('--primary')).toBe('24 90% 45%');
    // …but a token outside the safe subset is filtered out (never applied).
    expect(main.style.getPropertyValue('--radius')).toBe('');
    expect(main.style.getPropertyValue('--secondary')).toBe('');
    expect(main.style.getPropertyValue('--font-sans')).toBe('');
  });

  it('reflects the public contract fields without a duplicated projection', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(screen.getByText('hola@patitas.org')).toBeInTheDocument();
    expect(screen.getByText('NIT 900123456-7')).toBeInTheDocument();
    expect(screen.getByText('Bogotá, Cundinamarca')).toBeInTheDocument();
    // "Sitio web" also appears (icon-only) in the footer (T-D04) — scope to
    // the sidebar, which still shows the full visible link.
    const sidebar = within(screen.getByTestId('portal-side-panel'));
    expect(sidebar.getByRole('link', { name: 'Sitio web' })).toHaveAttribute(
      'href',
      'https://patitas.org',
    );
  });

  it('omits fields the contract does not expose (e.g. NIT hidden while informal)', async () => {
    const { nit: _nit, socialLinks: _socialLinks, ...informal } = ORG;
    stubFetch({ org: informal });

    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(screen.queryByText(/900123456-7/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sitio web' })).not.toBeInTheDocument();
    expect(screen.getByText('hola@patitas.org')).toBeInTheDocument();
  });

  it('renders the hero cover + logo from real URLs when the profile has them (T-D02)', async () => {
    stubFetch({
      org: {
        ...ORG,
        logoUrl: 'https://cdn.test/logo.png',
        coverPhotos: ['https://cdn.test/cover.png'],
      },
    });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(screen.getByAltText('Logo de Refugio Patitas')).toHaveAttribute(
      'src',
      'https://cdn.test/logo.png',
    );
    // The cover is decorative (alt=""); querying by its known src is the stable seam.
    const cover = document.querySelector('img[src="https://cdn.test/cover.png"]');
    expect(cover).not.toBeNull();
  });

  it('falls back to initials (no logo) when the profile has neither logo nor cover', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    // "Refugio Patitas" → initials "RP", never a broken <img>.
    expect(screen.getByText('RP')).toBeInTheDocument();
    expect(screen.queryByAltText(/Logo de/)).not.toBeInTheDocument();
  });

  it('hides the transparency bar when there is no real verification signal (level 0/absent)', async () => {
    const { verificationLevel: _level, ...noLevel } = ORG;
    stubFetch({ org: noLevel });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    // No fabricated "Nivel 0 · Rendición: No disponible" bar in front of the client.
    expect(screen.queryByTestId('transparency-indicator')).not.toBeInTheDocument();
  });

  it('shows the real animal count in the profile stats row', async () => {
    stubFetch();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/theme')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: {} }) });
        }
        if (url.includes('/animals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ items: [], total: 3, limit: 1, offset: 0 }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
      }),
    );
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    // KPI real en la línea de meta del hero (rediseño T-D05): "3 animales
    // disponibles" — el catálogo (T-D03) también muestra el mismo total en
    // su propio contador ("X de Y animales"), por eso se matchea el texto
    // completo en vez de solo el número.
    expect(await screen.findByTestId('portal-animal-count')).toHaveTextContent(
      '3 animales buscan hogar',
    );
  });

  it('shows a clear public 404 for an unknown slug', async () => {
    stubFetch({ orgStatus: 404, orgOk: false });

    renderShell({ route: '/o/no-existe', ...PUBLIC_SESSION });

    expect(await screen.findByText('Organización no encontrada')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Refugio Patitas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mascotas en adopción' })).not.toBeInTheDocument();
  });

  describe('S2-PORTAL: secciones ancladas (rediseño T-D04, sin tabs)', () => {
    it('always shows "Mascotas en adopción"; hides "Nosotros"/"Información" while empty', async () => {
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      // Ya no hay tabs (rediseño T-D04): las secciones son anclas reales,
      // siempre visibles cuando tienen contenido — "Nosotros"/"Información"
      // simplemente no se montan mientras estén vacías.
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Mascotas en adopción' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Nosotros' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Información de contacto' }),
      ).not.toBeInTheDocument();
      // Y el header nuevo trae solo las anclas con destino real.
      const nav = within(screen.getByTestId('public-header'));
      expect(nav.getByRole('link', { name: 'Animales' })).toHaveAttribute(
        'href',
        '#portal-section-pets',
      );
      expect(nav.queryByRole('link', { name: 'Nosotros' })).not.toBeInTheDocument();
      expect(nav.queryByRole('link', { name: 'Contacto' })).not.toBeInTheDocument();
    });

    it('shows "Nosotros" with the real content, inline, when aboutUs is set', async () => {
      stubFetch({ org: { ...ORG, aboutUs: 'Somos un refugio con 10 años de historia.' } });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      expect(
        await screen.findByText('Somos un refugio con 10 años de historia.'),
      ).toBeInTheDocument();
      const nav = within(screen.getByTestId('public-header'));
      expect(nav.getByRole('link', { name: 'Nosotros' })).toHaveAttribute('href', '#portal-about');
    });

    it('shows "Información" with hours/address/phones when extendedContact is set, and embeds an already-embeddable map URL', async () => {
      stubFetch({
        org: {
          ...ORG,
          extendedContact: {
            hours: 'Lun-Vie 9am-5pm',
            fullAddress: 'Calle 45 #12-34, Bogotá',
            mapUrl: 'https://maps.google.com/maps?q=Bogota&output=embed',
            additionalPhones: ['3001234567'],
          },
        },
      });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      expect(await screen.findByText('Lun-Vie 9am-5pm')).toBeInTheDocument();
      expect(screen.getByText('Calle 45 #12-34, Bogotá')).toBeInTheDocument();
      expect(screen.getByText('3001234567')).toBeInTheDocument();
      expect(screen.getByTitle('Ubicación en el mapa')).toHaveAttribute(
        'src',
        'https://maps.google.com/maps?q=Bogota&output=embed',
      );
    });

    it('S2-REORG: converts a Google Maps SHARE url (not already embeddable) instead of showing the "refused to connect" iframe', async () => {
      stubFetch({
        org: { ...ORG, extendedContact: { mapUrl: 'https://maps.google.com/?q=Bogota' } },
      });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      expect(await screen.findByTitle('Ubicación en el mapa')).toHaveAttribute(
        'src',
        'https://maps.google.com/maps?q=Bogota&output=embed',
      );
    });

    it('S2-REORG: falls back to a plain link for a non-Google-Maps URL (never an iframe that could be blocked)', async () => {
      stubFetch({
        org: { ...ORG, extendedContact: { mapUrl: 'https://www.openstreetmap.org/way/123' } },
      });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      const link = await screen.findByRole('link', { name: /Ver en mapa/ });
      expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/way/123');
      expect(screen.queryByTitle('Ubicación en el mapa')).not.toBeInTheDocument();
    });

    it('positions the logo per logoPosition (default "left" unchanged)', async () => {
      stubFetch({ org: { ...ORG, logoUrl: 'https://cdn.test/logo.png' }, logoPosition: 'center' });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

      await screen.findByAltText('Logo de Refugio Patitas');
      const hero = screen.getByRole('heading', { level: 1 }).closest('section') as HTMLElement;
      expect(hero.dataset.logo).toBe('center');
    });

    it('moves the social sidebar to the left when socialNavPosition is "left"', async () => {
      stubFetch({ socialNavPosition: 'left' });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      const panel = screen.getByTestId('portal-side-panel');
      expect(within(panel).getByRole('link', { name: 'Sitio web' })).toBeInTheDocument();
      expect(panel.className).toContain('lg:order-first');
    });
  });

  describe('pulido visual: KPIs en el header, acciones principales, panel lateral y libro público', () => {
    it('shows a real KPI (animales disponibles) and never a fabricated adopciones/donaciones/calificación tile', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/theme')) {
            return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: {} }) });
          }
          if (url.includes('/animals')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ items: [], total: 7, limit: 1, offset: 0 }),
            });
          }
          return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
        }),
      );
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      // KPI real en la línea de meta del hero (rediseño T-D05).
      expect(await screen.findByTestId('portal-animal-count')).toHaveTextContent(
        '7 animales buscan hogar',
      );
      // No fabricated metrics: those fields don't exist in the contract yet.
      expect(screen.queryByText(/Adopciones/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Calificación/)).not.toBeInTheDocument();
    });

    it('with the modules on, shows Donar/Apadrinar next to the main CTA, which scroll to the real catalog', async () => {
      stubFetch({ org: { ...ORG, aboutUs: 'Somos un refugio con 10 años de historia.' } });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      const actions = screen.getByTestId('portal-header-actions');
      expect(within(actions).getByTestId('portal-donate-cta')).toBeInTheDocument();
      const adoptar = within(actions).getByRole('button', { name: 'Conocer a nuestros animales' });
      const apadrinar = within(actions).getByRole('button', { name: 'Apadrinar' });

      // Neither reimplements a new flow (rediseño T-D04, ya sin tabs): ambos
      // solo desplazan a la sección real "Mascotas en adopción", donde viven
      // los flujos por-animal de siempre.
      const scrollSpy = vi.mocked(Element.prototype.scrollIntoView);
      scrollSpy.mockClear();

      await userEvent.click(adoptar);
      expect(scrollSpy).toHaveBeenCalledTimes(1);

      await userEvent.click(apadrinar);
      expect(scrollSpy).toHaveBeenCalledTimes(2);
    });

    it('2da iteración: "Campaña activa" y "Síguenos" viven juntas en UN panel lateral junto a las tabs (no sueltas arriba)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/theme')) {
            return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: {} }) });
          }
          if (url.includes('/campaigns')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({
                items: [
                  {
                    id: 'c1',
                    organizationId: 'org-1',
                    organizationName: 'Refugio Patitas',
                    title: 'Vacunas para el invierno',
                    category: 'medications',
                    goalAmount: 1_000_000,
                    raisedAmount: 250_000,
                    progress: 0.25,
                    deadline: '2027-01-01T00:00:00.000Z',
                    status: 'active',
                    createdAt: '2026-07-01T00:00:00.000Z',
                  },
                ],
                total: 1,
                limit: 12,
                offset: 0,
              }),
            });
          }
          if (url.includes('/animals')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ items: [], total: 0, limit: 1, offset: 0 }),
            });
          }
          return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
        }),
      );
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      const panel = screen.getByTestId('portal-side-panel');
      const campaign = await screen.findByTestId('portal-campaigns-section');
      const social = within(panel).getByRole('link', { name: 'Sitio web' });

      // Same lateral panel (aside), not two loose blocks in a horizontal strip.
      expect(panel).toContainElement(campaign);
      expect(panel).toContainElement(social);
      // The panel is a sibling of the main content column, not above/before
      // it — it's a two-column layout (grid), not a stacked strip.
      expect(panel.parentElement).toBe(screen.getByTestId('portal-main-grid'));
    });

    it('shows "Transparencia — libro público" with a ComingSoon modal (no real ledger data)', async () => {
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      expect(
        screen.getByRole('heading', { name: 'Transparencia — libro público' }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Ver libro completo →' }));
      expect(await screen.findByText('Libro público')).toBeInTheDocument();
      expect(screen.getByText('Pronto')).toBeInTheDocument();
    });
  });
});

describe('OrgPublicPage — plantillas del portal (Ola 3)', () => {
  function stubWithTemplate(template: unknown, templateOptions?: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/theme')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ tokens: {}, template, templateOptions }),
          });
        }
        if (url.includes('/animals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 'a1',
                  name: 'Luna',
                  species: 'dog',
                  sex: 'female',
                  size: 'medium',
                  photoUrl: 'https://cdn.example/luna.jpg',
                  breed: 'Criolla',
                },
              ],
              total: 5,
              limit: 8,
              offset: 0,
            }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
      }),
    );
  }

  it.each(['editorial', 'carnet', 'impacto', 'orbita'])(
    'con la plantilla %s cambia el hero y conserva los mismos datos',
    async (template) => {
      stubWithTemplate(template);
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

      const hero = await screen.findByTestId(`portal-hero-${template}`);
      expect(screen.getByTestId('portal-page')).toHaveAttribute('data-template', template);
      expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent('Refugio Patitas');
      expect(await within(hero).findByTestId('portal-animal-count')).toHaveTextContent('5');
      // Las acciones y el catálogo real siguen ahí.
      expect(within(hero).getByTestId('portal-header-actions')).toBeInTheDocument();
      expect(within(hero).getByRole('link', { name: /Luna/ })).toHaveAttribute(
        'href',
        '/o/patitas/animales/a1',
      );
    },
  );

  it('aplica los ajustes de la plantilla y descarta los que no le corresponden', async () => {
    stubWithTemplate('carnet', { pattern: 'huellas', showMinis: false, density: 'intensa' });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

    const hero = await screen.findByTestId('portal-hero-carnet');
    expect(screen.getByTestId('portal-page')).toHaveAttribute('data-pattern', 'huellas');
    await screen.findByTestId('portal-animal-count');
    // Sin mini carnets: el animal no aparece dentro del hero.
    expect(within(hero).queryByRole('link', { name: /Luna/ })).not.toBeInTheDocument();
  });

  it('una plantilla desconocida cae en la Clásica', async () => {
    stubWithTemplate('<script>');
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

    await screen.findByRole('heading', { name: /Refugio Patitas/ });
    expect(screen.getByTestId('portal-page')).toHaveAttribute('data-template', 'clasica');
    expect(screen.queryByTestId('portal-hero-editorial')).not.toBeInTheDocument();
  });
});

describe('OrgPublicPage — vista previa privada del dueño (Ola 3)', () => {
  const OWNER_SESSION = {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Dueña',
        email: 'duena@patitas.org',
        roles: [Role.Owner],
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };

  function stubUnpublished(ownSlug: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const respond = (status: number, body: unknown) =>
          Promise.resolve({
            ok: status < 400,
            status,
            headers: { get: () => null },
            json: async () => body,
          });
        if (url.includes('/public/organizations/')) return respond(404, {});
        if (url.endsWith('/org/profile')) {
          return respond(200, {
            ...ORG,
            slug: ownSlug,
            phone: '3001112233',
            legalName: 'Fundación Patitas SAS',
          });
        }
        if (url.endsWith('/portals/theme')) return respond(200, { tokens: {}, template: 'carnet' });
        if (url.includes('/org/portal/preview/animals')) {
          return respond(200, {
            items: [
              {
                id: 'a1',
                organizationId: 'org-1',
                name: 'Luna',
                species: 'dog',
                sex: 'female',
                size: 'medium',
                status: 'available',
                isActive: true,
                createdAt: '2026-10-01T00:00:00.000Z',
              },
            ],
            total: 1,
            limit: 8,
            offset: 0,
          });
        }
        return respond(200, []);
      }),
    );
  }

  it('el dueño ve su portal sin publicar como vista previa, con su plantilla y sin datos privados', async () => {
    stubUnpublished('patitas');
    renderShell({ route: '/o/patitas', ...OWNER_SESSION });

    expect(await screen.findByTestId('portal-owner-preview')).toHaveTextContent(
      'Solo tu equipo ve esta página',
    );
    expect(screen.getByTestId('portal-hero-carnet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Refugio Patitas');
    expect(screen.queryByText('Fundación Patitas SAS')).not.toBeInTheDocument();
    expect(screen.queryByText(/3001112233/)).not.toBeInTheDocument();
  });

  it('la vista previa muestra los animales propios aunque el catálogo público aún no exista', async () => {
    stubUnpublished('patitas');
    renderShell({ route: '/o/patitas', ...OWNER_SESSION });

    await screen.findByTestId('portal-owner-preview');
    expect((await screen.findAllByText('Luna')).length).toBeGreaterThan(0);
  });

  it('otra organización con sesión sigue viendo "no encontrada"', async () => {
    stubUnpublished('otra-org');
    renderShell({ route: '/o/patitas', ...OWNER_SESSION });

    expect(await screen.findByText('Organización no encontrada')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-owner-preview')).not.toBeInTheDocument();
  });

  it('el público sin sesión no ve la vista previa', async () => {
    stubUnpublished('patitas');
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

    expect(await screen.findByText('Organización no encontrada')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-owner-preview')).not.toBeInTheDocument();
  });
});
