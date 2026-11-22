import { buildAdoptPath, citySlug, publicAnimalPath } from './seo-paths';

/** Lo mínimo de un animal adoptable que necesita el sitemap. */
export interface SitemapAnimal {
  id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  publicCode?: string;
  photoUrl?: string;
  createdAt: string;
  organization: { slug: string; city?: string };
}

/** Una campaña ACTIVA (las demás no se listan). */
export interface SitemapCampaign {
  id: string;
  createdAt: string;
}

export interface SitemapEntry {
  path: string;
  lastmod?: string;
  images?: string[];
}

const day = (iso: string | undefined) =>
  typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : undefined;

const newest = (dates: (string | undefined)[]) =>
  dates
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

/**
 * Páginas que dependen de datos vivos: una por ciudad y especie donde HAY
 * animales publicados (nunca ciudades vacías: serían páginas delgadas), el
 * portal de cada organización con animales, cada ficha (con su foto, para
 * Google Imágenes) y cada campaña activa. Las páginas fijas (portada, guías,
 * /adoptar…) las lista el `sitemap.xml` que escribe el build de la web.
 */
export function sitemapEntries(
  animals: SitemapAnimal[],
  campaigns: SitemapCampaign[],
): SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  const cities = new Map<string, { city: string; animals: SitemapAnimal[] }>();
  const orgs = new Map<string, SitemapAnimal[]>();
  for (const animal of animals) {
    const slug = animal.organization.slug;
    if (!slug) continue;
    orgs.set(slug, [...(orgs.get(slug) ?? []), animal]);
    const city = animal.organization.city?.trim();
    const key = city ? citySlug(city) : '';
    if (!city || !key) continue;
    const entry = cities.get(key) ?? { city, animals: [] };
    entry.animals.push(animal);
    cities.set(key, entry);
  }

  for (const { city, animals: here } of cities.values()) {
    for (const species of ['all', 'dog', 'cat'] as const) {
      const list = species === 'all' ? here : here.filter((a) => a.species === species);
      if (!list.length) continue;
      entries.push({
        path: buildAdoptPath(species, city),
        lastmod: newest(list.map((a) => day(a.createdAt))),
      });
    }
  }

  for (const [slug, list] of orgs) {
    entries.push({
      path: `/o/${encodeURIComponent(slug)}`,
      lastmod: newest(list.map((a) => day(a.createdAt))),
    });
  }

  for (const animal of animals) {
    if (!animal.organization.slug) continue;
    entries.push({
      path: publicAnimalPath(animal.organization.slug, animal),
      lastmod: day(animal.createdAt),
      images: animal.photoUrl && /^https:\/\//.test(animal.photoUrl) ? [animal.photoUrl] : [],
    });
  }

  for (const campaign of campaigns) {
    entries.push({ path: `/campanas/${campaign.id}`, lastmod: day(campaign.createdAt) });
  }
  return entries;
}

const xmlEscape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** `<urlset>` con la extensión de imágenes de Google. */
export function renderSitemap(baseUrl: string, entries: SitemapEntry[]): string {
  const base = baseUrl.replace(/\/+$/, '');
  const urls = entries.map((entry) => {
    const parts = [`<loc>${xmlEscape(`${base}${entry.path}`)}</loc>`];
    if (entry.lastmod) parts.push(`<lastmod>${entry.lastmod}</lastmod>`);
    for (const image of entry.images ?? []) {
      parts.push(`<image:image><image:loc>${xmlEscape(image)}</image:loc></image:image>`);
    }
    return `  <url>${parts.join('')}</url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
