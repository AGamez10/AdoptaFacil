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
  campaignDescription,
  campaignTitle,
  parseAnimalUrlSegment,
  portalDescription,
  portalTitle,
  publicAnimalPath,
  shelterLd,
} from './page-meta.js';
import caddyfile from '../../../../deploy/Caddyfile?raw';
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
    expect(adoptDescription('dog', 'Cali', 3)).toMatch(/^3 perros esperan hogar en Cali\./);
    expect(adoptDescription('cat', 'Cali', 1)).toMatch(/^1 gato espera hogar en Cali\./);
    expect(adoptDescription('all', null, 2)).toMatch(
      /^2 animales esperan hogar en toda Colombia\./,
    );
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

describe('portal y campañas (SEO)', () => {
  const org = {
    name: 'Fundación Patitas',
    slug: 'patitas',
    logoUrl: 'https://cdn.test/logo.png',
    coverPhotos: ['https://cdn.test/portada.jpg'],
    location: { city: 'Cali', department: 'Valle del Cauca', address: 'Calle 1 # 2-3' },
    socialLinks: { instagram: 'https://instagram.com/patitas', facebook: 'javascript:alert(1)' },
  };

  it('titula el portal con su ciudad y describe con datos reales si no hay texto propio', () => {
    expect(portalTitle(org)).toBe('Fundación Patitas: perros y gatos en adopción en Cali');
    expect(portalDescription(org, 12)).toMatch(
      /^12 animales esperan hogar con Fundación Patitas en Cali\./,
    );
    const long = 'Rescatamos perros y gatos en Cali desde 2015. '.repeat(10);
    const own = portalDescription({ ...org, description: long });
    expect(own.length).toBeLessThanOrEqual(155);
    expect(own.endsWith('…')).toBe(true);
  });

  it('AnimalShelter con ciudad y departamento, nunca la dirección exacta ni enlaces no https', () => {
    const ld = shelterLd(org, '/o/patitas', (path) => `https://adoptafacil.test${path}`);
    expect(ld).toMatchObject({
      '@type': 'AnimalShelter',
      url: 'https://adoptafacil.test/o/patitas',
      address: { addressLocality: 'Cali', addressRegion: 'Valle del Cauca', addressCountry: 'CO' },
      sameAs: ['https://instagram.com/patitas'],
    });
    expect(JSON.stringify(ld)).not.toContain('Calle 1');
    expect(JSON.stringify(ld)).not.toContain('javascript:');
  });

  it('describe una campaña con su meta y su avance en pesos', () => {
    const campaign = {
      title: 'Cirugía de Toby',
      organizationName: 'Patitas',
      goalAmount: 1500000,
      raisedAmount: 300000,
    };
    expect(campaignTitle(campaign)).toBe('Cirugía de Toby · Campaña de Patitas');
    expect(campaignDescription(campaign)).toContain('Meta $1.500.000, van $300.000.');
  });
});

describe('despliegue (Caddy) del HTML prerenderizado', () => {
  it('sirve /ruta/index.html para /ruta y el cascarón app.html para lo demás', () => {
    // Antes `try_files {path} /index.html`: /adoptar/perros no casaba con su
    // carpeta y TODA URL respondía el HTML de la portada a los buscadores.
    expect(caddyfile).toMatch(/try_files \{path\} \{path\}\/index\.html \/app\.html/);
  });
});
