/**
 * URLs públicas de la web, en el servidor. Espejo EXACTO de
 * `apps/web/src/seo/page-meta.js` (citySlug, buildAdoptPath, publicAnimalPath):
 * el sitemap dinámico debe listar las mismas URLs que la web sirve y canoniza.
 * `seo-paths.spec.ts` fija los mismos casos que las pruebas de la web.
 */
export type SitemapSpecies = 'dog' | 'cat' | 'other' | 'all';

const SPECIES_SLUGS = { dog: 'perros', cat: 'gatos', other: 'otros' } as const;

/** "Bogotá D.C." → "bogota-d-c". */
export function citySlug(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** /adoptar, /adoptar/perros, /adoptar/animales/medellin. */
export function buildAdoptPath(species: SitemapSpecies, city?: string | null): string {
  const speciesPart = species === 'all' ? 'animales' : SPECIES_SLUGS[species];
  if (city) return `/adoptar/${speciesPart}/${citySlug(city)}`;
  if (species === 'all') return '/adoptar';
  return `/adoptar/${speciesPart}`;
}

/** "luna-k7m2qp8x" (nombre + código público); sin código cae al id. */
export function animalUrlSegment(animal: { id: string; name: string; publicCode?: string }) {
  if (!animal.publicCode) return animal.id;
  const name = citySlug(animal.name).slice(0, 60).replace(/-+$/, '');
  return name ? `${name}-${animal.publicCode}` : animal.publicCode;
}

/** /o/<org>/animales/<nombre>-<código>. */
export function publicAnimalPath(
  orgSlug: string,
  animal: { id: string; name: string; publicCode?: string },
): string {
  return `/o/${encodeURIComponent(orgSlug)}/animales/${encodeURIComponent(animalUrlSegment(animal))}`;
}
