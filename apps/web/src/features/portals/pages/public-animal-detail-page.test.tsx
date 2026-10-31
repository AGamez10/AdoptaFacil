import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  CLOSED_CAPABILITIES,
  type AnimalSummary,
  type PublicCapabilities,
} from '@adoptafacil/contracts';
import { CapabilitiesProvider } from '../../../shell/capabilities';
import { OPEN_CAPABILITIES } from '../../../test-utils';
import { PublicAnimalDetailPage } from './public-animal-detail-page';

/**
 * §M14/M03 (T-052) — public animal detail. Public fields only (never clinical
 * record/reminders/documents) + a "Solicitar adopción" CTA into the T-028a flow.
 *
 * F-LANDING-02: an animal is reached from BOTH the general portal (`/`) and its
 * org's portal (`/o/:slug`), so the page offers two exits — "Volver al inicio"
 * (always present, no fetch needed) and "Ver {org name}" (independent,
 * best-effort fetch of the org's public profile; absent if it fails/never a
 * generic label).
 */
const ANIMAL: AnimalSummary = {
  id: 'a1',
  organizationId: 'org-1',
  name: 'Firulais',
  species: 'dog',
  sex: 'male',
  size: 'medium',
  status: 'available',
  photoUrl: 'https://cdn.test/firulais.jpg',
  breed: 'Criollo',
  publicCode: 'k7m2qp8x',
};

const CANONICAL_PATH = '/o/patitas/animales/firulais-k7m2qp8x';

// F-EDAD-DETALLE: a 1-year-old, non-approximate animal — ageLabel() renders
// this as "1 año" (see animals-catalog.test.ts), same string AnimalCard shows
// in the catalog for an identical computedAge.
const ANIMAL_WITH_AGE: AnimalSummary = {
  ...ANIMAL,
  computedAge: { years: 1, months: 0, totalMonths: 12, approximate: false },
};

function renderDetail(
  options: {
    state?: { animal: AnimalSummary };
    capabilities?: PublicCapabilities;
    pathname?: string;
  } = {},
) {
  return render(
    <CapabilitiesProvider value={options.capabilities ?? OPEN_CAPABILITIES}>
      <MemoryRouter
        initialEntries={[
          { pathname: options.pathname ?? CANONICAL_PATH, state: options.state ?? null },
        ]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route
            path="/o/:slug/animales/:animalId"
            element={
              <>
                <PublicAnimalDetailPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </CapabilitiesProvider>,
  );
}

/** Shows the router's current path so redirects can be asserted. */
function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

/** Discriminates the ONE-animal endpoint (`/animals/:ref`, 404 when `animal` is
 *  null) from the catalog (`/animals?…`) and anything else (org profile). */
function stubDetail(animal: AnimalSummary | null, catalog: unknown = { items: [], total: 0 }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL) => {
      const href = String(url);
      if (/\/animals\/[^/?]+$/.test(href)) {
        return Promise.resolve(
          animal
            ? { ok: true, status: 200, json: async () => animal }
            : { ok: false, status: 404, json: async () => ({}) },
        );
      }
      const body = href.includes('/animals') ? catalog : {};
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    }),
  );
}

/** Stubs the public sponsorship summary (`/public/sponsorships/animals/:id`) with the
 *  given active plans; every other URL answers the org profile (`profileBody`). */
function stubWithSponsorshipPlans(activePlans: unknown[], profileBody: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL) => {
      const isSponsorship = String(url).includes('/public/sponsorships/');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () =>
          isSponsorship ? { animalId: 'a1', activePlans, activeSponsorCount: 0 } : profileBody,
      });
    }),
  );
}

/** Discriminates by URL: the org PROFILE endpoint vs. the animals CATALOG one
 *  (they're different fetches, different shapes — see PublicAnimalDetailPage). */
function stubByUrl(profileBody: unknown, animalsBody: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL) => {
      const isProfile = !String(url).includes('/animals');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => (isProfile ? profileBody : animalsBody),
      });
    }),
  );
}

// Every test either overrides this via stubDetail/stubByUrl, or relies on
// nav-state to skip the animal fetch — but the org-NAME fetch always fires
// regardless of nav-state, so fetch must never be left unstubbed.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicAnimalDetailPage', () => {
  it('renders the public info from nav-state (no refetch) with a "Solicitar adopción" CTA', () => {
    renderDetail({ state: { animal: ANIMAL } });

    expect(screen.getByTestId('public-animal-detail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Firulais' })).toBeInTheDocument();
    expect(screen.getByText('Perro')).toBeInTheDocument();
    expect(screen.getByText('Macho')).toBeInTheDocument();
    expect(screen.getByText('Mediano')).toBeInTheDocument();

    const cta = screen.getByTestId('request-adoption-cta');
    const href = cta.getAttribute('href') ?? '';
    expect(href).toContain('/adopciones/solicitar?');
    expect(href).toContain('organizationId=org-1');
    expect(href).toContain('animalId=a1');
    expect(href).toContain('species=dog');

    // F1-03+: hierarchy — "Solicitar adopción" stays the SOLID, protagonist
    // button; "Volver al inicio" is a SECONDARY (outline) button, never solid.
    expect(cta.className).toContain('button--primary');
    const backLink = screen.getByRole('link', { name: '← Volver al inicio' });
    expect(backLink.className).toContain('button--outline');
    expect(backLink.className).not.toContain('button--primary');
  });

  it('F-CTA-APADRINAR: hides "Apadrinar" when the animal has no active sponsorship plan', async () => {
    stubWithSponsorshipPlans([]);
    renderDetail({ state: { animal: ANIMAL } });

    await screen.findByTestId('request-adoption-cta');
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('sponsor-animal-cta')).not.toBeInTheDocument();
  });

  it('F-CTA-APADRINAR: shows an "Apadrinar" CTA linking to /apadrinar with the animal id and name when a plan exists', async () => {
    stubWithSponsorshipPlans([{ id: 'plan-1' }]);
    renderDetail({ state: { animal: ANIMAL } });

    const cta = await screen.findByTestId('sponsor-animal-cta');
    const href = cta.getAttribute('href') ?? '';
    expect(href).toContain('/apadrinar?');
    expect(href).toContain('animalId=a1');
    expect(href).toContain('animalName=Firulais');
    // No org name resolved yet at this point — never a stale/generic value.
    expect(href).not.toContain('organizationName');

    // Secondary CTA (outline) — "Solicitar adopción" stays the sole solid/primary one.
    expect(cta.className).not.toContain('button--primary');
  });

  it('F-CTA-APADRINAR: includes organizationName in the href once the org profile resolves', async () => {
    stubWithSponsorshipPlans([{ id: 'plan-1' }], { name: 'Fundación Patitas' });
    renderDetail({ state: { animal: ANIMAL } });

    await screen.findByRole('link', { name: 'Ver Fundación Patitas' });
    const cta = await screen.findByTestId('sponsor-animal-cta');
    expect(cta.getAttribute('href') ?? '').toContain('organizationName=Fundaci%C3%B3n+Patitas');
  });

  it('Ola 1 (R1-1): with sponsorships off, "Apadrinar" is never offered nor fetched', async () => {
    stubWithSponsorshipPlans([{ id: 'plan-1' }]);
    renderDetail({ state: { animal: ANIMAL }, capabilities: CLOSED_CAPABILITIES });

    await screen.findByTestId('request-adoption-cta');
    expect(screen.queryByTestId('sponsor-animal-cta')).not.toBeInTheDocument();
    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls.some((url) => url.includes('/public/sponsorships/'))).toBe(false);
  });

  it('F-CTA-APADRINAR: absent in the not-found state, same as "Solicitar adopción"', async () => {
    stubDetail(null);
    renderDetail();
    await screen.findByText('Animal no encontrado');
    expect(screen.queryByTestId('sponsor-animal-cta')).not.toBeInTheDocument();
  });

  it('F-EDAD-DETALLE: shows the age via ageLabel() ("1 año"), same string AnimalCard renders — never raw totalMonths', () => {
    renderDetail({ state: { animal: ANIMAL_WITH_AGE } });

    expect(screen.getByText('1 año')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ meses$/)).not.toBeInTheDocument();
  });

  it('F-EDAD-DETALLE: a fresh/clamped-to-zero computedAge renders "< 1 mes", never "0 meses"', () => {
    renderDetail({
      state: {
        animal: {
          ...ANIMAL,
          computedAge: { years: 0, months: 0, totalMonths: 0, approximate: false },
        },
      },
    });

    expect(screen.getByText('< 1 mes')).toBeInTheDocument();
    expect(screen.queryByText('0 meses')).not.toBeInTheDocument();
  });

  it('never exposes internal/clinical data (M03 internal surface)', () => {
    renderDetail({ state: { animal: ANIMAL } });
    // Only public AnimalSummary fields are ever shown — no clinical record surface.
    expect(screen.queryByText(/expediente|historia cl[ií]nica|vacun|recordatorio/i)).toBeNull();
  });

  it('resolves the animal by its public code on a deep link (no nav-state)', async () => {
    stubDetail(ANIMAL);
    renderDetail();
    expect(await screen.findByTestId('public-animal-detail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Firulais' })).toBeInTheDocument();
    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls).toContain('http://localhost:3000/public/organizations/patitas/animals/k7m2qp8x');
    // "Más animales" reads only a handful of rows, never the whole catalog.
    expect(calls.some((url) => url.includes('limit=50'))).toBe(false);
  });

  it('a legacy link with the internal id loads and is replaced by the public-code URL', async () => {
    const legacyId = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
    stubDetail({ ...ANIMAL, id: legacyId });
    renderDetail({ pathname: `/o/patitas/animales/${legacyId}` });
    expect(await screen.findByTestId('public-animal-detail')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(CANONICAL_PATH));
    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls.some((url) => url.endsWith(`/animals/${legacyId}`))).toBe(true);
  });

  it('a URL segment that is neither a code nor an id is not found without asking the API for it', async () => {
    stubDetail(ANIMAL);
    renderDetail({ pathname: '/o/patitas/animales/firulais' });
    expect(await screen.findByText('Animal no encontrado')).toBeInTheDocument();
    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls.some((url) => /\/animals\/[^/?]+$/.test(url))).toBe(false);
  });

  it('shows a not-found state when the public endpoint answers 404', async () => {
    stubDetail(null);
    renderDetail();
    expect(await screen.findByText('Animal no encontrado')).toBeInTheDocument();
    expect(screen.queryByTestId('request-adoption-cta')).not.toBeInTheDocument();
    // Un QR de carnet ya impreso de un animal adoptado lleva a su organización.
    expect(screen.getByTestId('animal-not-found-org-link').getAttribute('href')).toMatch(/^\/o\//);
  });

  it('F-LANDING-02: always shows "Volver al inicio" (→ /), even before the org name loads', () => {
    renderDetail({ state: { animal: ANIMAL } });
    expect(screen.getByRole('link', { name: '← Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('F-LANDING-02: shows "Ver {org name}" (→ /o/:slug) once the org profile resolves — never a generic label', async () => {
    stubByUrl({ name: 'Fundación Patitas' }, { items: [ANIMAL], total: 1, limit: 50, offset: 0 });
    renderDetail({ state: { animal: ANIMAL } });

    expect(screen.getByRole('link', { name: '← Volver al inicio' })).toHaveAttribute('href', '/');
    const orgLink = await screen.findByRole('link', { name: 'Ver Fundación Patitas' });
    expect(orgLink).toHaveAttribute('href', '/o/patitas');
    // Never a generic fallback label while/if the name is unavailable.
    expect(screen.queryByRole('link', { name: /^Ver$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Ver organización')).not.toBeInTheDocument();
  });

  it('F-LANDING-02: "Ver {org}" stays absent (never generic) when the org profile fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderDetail({ state: { animal: ANIMAL } });

    expect(screen.getByRole('link', { name: '← Volver al inicio' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/^Ver /)).not.toBeInTheDocument();
  });

  it('rediseño: shows the AdoptaFácil navbar, the organization card and more animals from it', async () => {
    const OTHER: AnimalSummary = { ...ANIMAL, id: 'a2', name: 'Canela', sex: 'female' };
    stubByUrl(
      { id: 'org-1', name: 'Fundación Patitas', location: { city: 'Cali' } },
      { items: [ANIMAL, OTHER], total: 2, limit: 50, offset: 0 },
    );
    renderDetail({ state: { animal: ANIMAL } });

    expect(screen.getByRole('banner')).toBeInTheDocument();
    const org = await screen.findByRole('region', { name: 'Organización responsable' });
    expect(org).toHaveTextContent('Fundación Patitas');
    expect(org).toHaveTextContent('Cali');
    const similar = await screen.findByRole('region', { name: 'Más amigos de Fundación Patitas' });
    expect(similar).toHaveTextContent('Canela');
    expect(similar).not.toHaveTextContent('Firulais');
    expect(screen.getByRole('link', { name: 'Más perros en adopción en Cali' })).toHaveAttribute(
      'href',
      '/adoptar/perros/cali',
    );
  });

  it('rediseño: keeps the adoption request one tap away on mobile (fixed bar)', () => {
    renderDetail({ state: { animal: ANIMAL } });
    const links = screen.getAllByRole('link', { name: 'Solicitar adopción' });
    expect(links).toHaveLength(2);
    expect(links[1]?.getAttribute('href')).toBe(links[0]?.getAttribute('href'));
  });
});
