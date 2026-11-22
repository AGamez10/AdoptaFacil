import { buildAdoptPath, citySlug, publicAnimalPath } from './seo-paths';
import { renderSitemap, sitemapEntries, type SitemapAnimal } from './sitemap.builder';

const animal = (over: Partial<SitemapAnimal> = {}): SitemapAnimal => ({
  id: '0b1c2d3e-0000-4000-8000-000000000001',
  name: 'Luna',
  species: 'dog',
  publicCode: 'k7m2qp8x',
  photoUrl: 'https://cdn.test/luna.jpg',
  createdAt: '2026-11-20T10:00:00.000Z',
  organization: { slug: 'huellitas', city: 'Bogotá D.C.' },
  ...over,
});

describe('seo paths (mirror of apps/web/src/seo/page-meta.js)', () => {
  it('builds the same clean URLs as the web', () => {
    expect(citySlug('Bogotá D.C.')).toBe('bogota-d-c');
    expect(buildAdoptPath('all')).toBe('/adoptar');
    expect(buildAdoptPath('dog')).toBe('/adoptar/perros');
    expect(buildAdoptPath('cat', 'Medellín')).toBe('/adoptar/gatos/medellin');
    expect(buildAdoptPath('all', 'Cali')).toBe('/adoptar/animales/cali');
    expect(publicAnimalPath('huellitas', animal())).toBe('/o/huellitas/animales/luna-k7m2qp8x');
    expect(publicAnimalPath('huellitas', animal({ publicCode: undefined }))).toBe(
      '/o/huellitas/animales/0b1c2d3e-0000-4000-8000-000000000001',
    );
  });
});

describe('sitemapEntries', () => {
  it('lists cities and species only where there are animals, plus portals, animals and campaigns', () => {
    const entries = sitemapEntries(
      [
        animal(),
        animal({
          id: 'x2',
          name: 'Michi',
          species: 'cat',
          publicCode: 'a1b2c3d4',
          createdAt: '2026-11-21T08:00:00.000Z',
          organization: { slug: 'huellitas', city: 'Bogota D.C.' },
        }),
      ],
      [{ id: 'c1', createdAt: '2026-11-01T00:00:00.000Z' }],
    );
    const paths = entries.map((entry) => entry.path);
    expect(paths).toEqual([
      '/adoptar/animales/bogota-d-c',
      '/adoptar/perros/bogota-d-c',
      '/adoptar/gatos/bogota-d-c',
      '/o/huellitas',
      '/o/huellitas/animales/luna-k7m2qp8x',
      '/o/huellitas/animales/michi-a1b2c3d4',
      '/campanas/c1',
    ]);
    expect(entries[0].lastmod).toBe('2026-11-21');
    expect(entries[1].lastmod).toBe('2026-11-20');
    expect(entries[4].images).toEqual(['https://cdn.test/luna.jpg']);
  });

  it('never lists a city page without animals nor an animal photo that is not https', () => {
    const entries = sitemapEntries(
      [animal({ organization: { slug: 'sin-ciudad' }, photoUrl: '/api/files/x.jpg' })],
      [],
    );
    expect(entries.map((entry) => entry.path)).toEqual([
      '/o/sin-ciudad',
      '/o/sin-ciudad/animales/luna-k7m2qp8x',
    ]);
    expect(entries[1].images).toEqual([]);
  });
});

describe('renderSitemap', () => {
  it('writes absolute, escaped URLs with the image extension', () => {
    const xml = renderSitemap('https://adoptafacil.test/', [
      { path: '/o/a&b', lastmod: '2026-11-20', images: ['https://cdn.test/x.jpg?a=1&b=2'] },
    ]);
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain('<loc>https://adoptafacil.test/o/a&amp;b</loc>');
    expect(xml).toContain('<lastmod>2026-11-20</lastmod>');
    expect(xml).toContain('<image:loc>https://cdn.test/x.jpg?a=1&amp;b=2</image:loc>');
  });
});
