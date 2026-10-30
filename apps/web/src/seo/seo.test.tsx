import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GuidePage, GuidesIndexPage } from '../features/guias';
import { GUIDES } from './guides';
import {
  adoptDescription,
  adoptTitle,
  animalDescription,
  animalTitle,
  animalUrlSegment,
  parseAnimalUrlSegment,
  publicAnimalPath,
} from './page-meta.js';
import { breadcrumbLd, useSeo } from './seo';

function Probe({ noindex = false }: { noindex?: boolean }) {
  useSeo({
    title: 'Perros en adopción en Bogotá',
    description: 'Descripción de prueba',
    path: '/adoptar/perros/bogota',
    image: 'https://cdn.test/rocco.jpg',
    noindex,
    jsonLd: [breadcrumbLd([{ name: 'Inicio', path: '/' }])],
  });
  return null;
}

const head = (selector: string) => document.head.querySelector(selector);
const ldBlocks = () =>
  Array.from(document.head.querySelectorAll('script[type="application/ld+json"]')).map(
    (node) => JSON.parse(node.textContent ?? '{}') as Record<string, unknown>,
  );

function renderGuides(route: string) {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/guias" element={<GuidesIndexPage />} />
        <Route path="/guias/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('useSeo', () => {
  it('writes title, description, canonical, Open Graph and JSON-LD, and removes the JSON-LD on unmount', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://adoptafacil.test/');
    const view = render(<Probe />);
    expect(document.title).toBe('Perros en adopción en Bogotá · AdoptaFácil');
    expect(head('meta[name="description"]')?.getAttribute('content')).toBe('Descripción de prueba');
    expect(head('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://adoptafacil.test/adoptar/perros/bogota',
    );
    expect(head('meta[property="og:image"]')?.getAttribute('content')).toBe(
      'https://cdn.test/rocco.jpg',
    );
    expect(head('meta[name="robots"]')).toBeNull();
    expect(ldBlocks()[0]).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [{ item: 'https://adoptafacil.test/' }],
    });
    view.unmount();
    expect(ldBlocks()).toHaveLength(0);
  });

  it('marks filtered or empty pages as noindex', () => {
    render(<Probe noindex />);
    expect(head('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
  });
});

describe('page-meta (shared with the build prerender)', () => {
  it('writes natural titles and descriptions by species and city', () => {
    expect(adoptTitle('dog', 'Bogotá')).toBe('Perros en adopción en Bogotá');
    expect(adoptTitle('all', null)).toBe('Perros y gatos en adopción en Colombia');
    expect(adoptDescription('dog', 'Cali', 3)).toMatch(/^3 animales esperan hogar en Cali\./);
    expect(adoptDescription('cat', null, 0)).toMatch(
      /^Encuentra gatos en adopción en toda Colombia\./,
    );
    expect(animalTitle({ name: 'Rocco', species: 'dog' }, 'Bogotá')).toBe(
      'Rocco, perro en adopción en Bogotá',
    );
    expect(
      animalDescription({ name: 'Rocco', species: 'dog', breed: 'Labrador' }, 'Patitas', 'Bogotá'),
    ).toBe(
      'Conoce a Rocco, perro Labrador que busca hogar. Lo cuida Patitas en Bogotá. Solicita su adopción en línea con AdoptaFácil.',
    );
  });
});

describe('Guías públicas', () => {
  it('lists every guide with a link to it', () => {
    renderGuides('/guias');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    for (const guide of GUIDES) {
      expect(
        screen.getByRole('link', { name: new RegExp(guide.title.slice(0, 20)) }),
      ).toHaveAttribute('href', `/guias/${guide.slug}`);
    }
  });

  it('renders a guide with its FAQ and Article + FAQPage structured data', () => {
    const guide = GUIDES[0]!;
    renderGuides(`/guias/${guide.slug}`);
    expect(screen.getByRole('heading', { level: 1, name: guide.title })).toBeInTheDocument();
    expect(screen.getByText(guide.faq[0]!.q)).toBeInTheDocument();
    const types = ldBlocks().map((block) => block['@type']);
    expect(types).toEqual(['Article', 'FAQPage', 'BreadcrumbList']);
  });

  it('sends an unknown guide back to the index', () => {
    renderGuides('/guias/no-existe');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Todo lo que necesitas para adoptar bien.' }),
    ).toBeInTheDocument();
  });
});

describe('URL pública de un animal (sin id interno)', () => {
  const luna = {
    id: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90',
    name: 'Luna Ñoña',
    publicCode: 'k7m2qp8x',
  };

  it('arma /o/<org>/animales/<nombre>-<código> sin el id', () => {
    expect(publicAnimalPath('huellitas', luna)).toBe('/o/huellitas/animales/luna-nona-k7m2qp8x');
    expect(publicAnimalPath('huellitas', luna)).not.toContain(luna.id);
  });

  it('sin código público (proyección vieja) usa el id; sin nombre útil, solo el código', () => {
    expect(animalUrlSegment({ id: luna.id, name: 'Luna' })).toBe(luna.id);
    expect(animalUrlSegment({ ...luna, name: '¡¡!!' })).toBe('k7m2qp8x');
  });

  it('lee la forma nueva (vale el código final) y la vieja (UUID, marcada para redirigir)', () => {
    expect(parseAnimalUrlSegment('luna-nona-k7m2qp8x')).toEqual({ ref: 'k7m2qp8x', legacy: false });
    expect(parseAnimalUrlSegment('otro-nombre-K7M2QP8X')).toEqual({
      ref: 'k7m2qp8x',
      legacy: false,
    });
    expect(parseAnimalUrlSegment(luna.id)).toEqual({ ref: luna.id, legacy: true });
  });

  it('rechaza cualquier otra cosa sin llegar a la API', () => {
    for (const bad of [undefined, '', 'luna', 'luna-k7m2qp8', 'luna-k7m2qp8i', "' OR 1=1 --"]) {
      expect(parseAnimalUrlSegment(bad)).toBeNull();
    }
  });
});
