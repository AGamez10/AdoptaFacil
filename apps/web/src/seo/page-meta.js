// @ts-check
/**
 * Textos SEO compartidos entre la app (React) y el prerender de build
 * (`scripts/prerender-seo.mjs`). JavaScript plano a propósito: Node lo importa
 * sin compilar y TypeScript lo tipa con `page-meta.d.ts`.
 */

/** @type {Record<'dog' | 'cat' | 'other', 'perros' | 'gatos' | 'otros'>} */
export const SPECIES_SLUGS = { dog: 'perros', cat: 'gatos', other: 'otros' };

/**
 * "Bogotá D.C." → "bogota-d-c"; sin tildes ni signos, solo minúsculas y guiones.
 * @param {string} city
 */
export function citySlug(city) {
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * URL limpia del listado: /adoptar, /adoptar/perros, /adoptar/animales/medellin.
 * @param {'dog' | 'cat' | 'other' | 'all'} species
 * @param {string | null | undefined} [city]
 */
export function buildAdoptPath(species, city) {
  const speciesPart = species === 'all' ? 'animales' : SPECIES_SLUGS[species];
  if (city) return `/adoptar/${speciesPart}/${citySlug(city)}`;
  if (species === 'all') return '/adoptar';
  return `/adoptar/${speciesPart}`;
}

/** Código público de un animal: 8 caracteres de Crockford base32 (lo genera la base). */
export const PUBLIC_CODE_PATTERN = /^[0-9a-hjkmnp-tv-z]{8}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Último tramo de la URL pública de un animal: "luna-k7m2qp8x" (nombre + código
 * público). Sin código (proyecciones viejas) cae al id, que la API sigue
 * resolviendo y la ficha redirige a la URL nueva.
 * @param {{ id: string; name: string; publicCode?: string }} animal
 */
export function animalUrlSegment(animal) {
  if (!animal.publicCode) return animal.id;
  const name = citySlug(animal.name).slice(0, 60).replace(/-+$/, '');
  return name ? `${name}-${animal.publicCode}` : animal.publicCode;
}

/**
 * URL pública de la ficha: /o/<org>/animales/<nombre>-<código>. Nunca expone el
 * id interno cuando el animal ya tiene código público.
 * @param {string} orgSlug
 * @param {{ id: string; name: string; publicCode?: string }} animal
 */
export function publicAnimalPath(orgSlug, animal) {
  return `/o/${encodeURIComponent(orgSlug)}/animales/${encodeURIComponent(animalUrlSegment(animal))}`;
}

/**
 * Lee el tramo de la URL de una ficha. Acepta la forma nueva ("luna-k7m2qp8x":
 * vale el código del final, el nombre es decorativo) y la vieja (UUID, que
 * `legacy` marca para redirigir). Cualquier otra cosa → null (no encontrado),
 * sin llamar a la API.
 * @param {string | undefined} segment
 * @returns {{ ref: string; legacy: boolean } | null}
 */
export function parseAnimalUrlSegment(segment) {
  const value = (segment ?? '').trim().toLowerCase();
  if (UUID_PATTERN.test(value)) return { ref: value, legacy: true };
  const code = value.slice(value.lastIndexOf('-') + 1);
  return PUBLIC_CODE_PATTERN.test(code) ? { ref: code, legacy: false } : null;
}

/** @type {Record<'dog' | 'cat' | 'other' | 'all', string>} */
export const SPECIES_PLURAL = {
  dog: 'Perros',
  cat: 'Gatos',
  other: 'Otros animales',
  all: 'Perros y gatos',
};

/** @type {Record<'dog' | 'cat' | 'other', string>} */
export const SPECIES_SINGULAR = { dog: 'perro', cat: 'gato', other: 'animal' };

/**
 * @param {'dog' | 'cat' | 'other' | 'all'} species
 * @param {string | null | undefined} city
 */
export function adoptTitle(species, city) {
  const base = `${SPECIES_PLURAL[species]} en adopción`;
  return city ? `${base} en ${city}` : `${base} en Colombia`;
}

/**
 * @param {'dog' | 'cat' | 'other' | 'all'} species
 * @param {string | null | undefined} city
 * @param {number | null | undefined} count
 */
export function adoptDescription(species, city, count) {
  const who = species === 'all' ? 'perros y gatos' : SPECIES_PLURAL[species].toLowerCase();
  const where = city ? `en ${city}` : 'en toda Colombia';
  const lead =
    typeof count === 'number' && count > 0
      ? `${count} ${count === 1 ? 'animal espera' : 'animales esperan'} hogar ${where}.`
      : `Encuentra ${who} en adopción ${where}.`;
  return `${lead} Filtra por tamaño, edad y sexo, conoce la organización que los cuida y solicita la adopción en línea, gratis.`;
}

/**
 * @param {{ name: string; species: 'dog' | 'cat' | 'other'; breed?: string }} animal
 * @param {string | null | undefined} city
 */
export function animalTitle(animal, city) {
  return `${animal.name}, ${SPECIES_SINGULAR[animal.species]} en adopción${city ? ` en ${city}` : ''}`;
}

/**
 * @param {{ name: string; species: 'dog' | 'cat' | 'other'; breed?: string }} animal
 * @param {string | null | undefined} orgName
 * @param {string | null | undefined} city
 */
export function animalDescription(animal, orgName, city) {
  const breed = animal.breed ? ` ${animal.breed}` : '';
  const who = orgName ? ` Lo cuida ${orgName}` : '';
  const where = city ? ` en ${city}` : '';
  return `Conoce a ${animal.name}, ${SPECIES_SINGULAR[animal.species]}${breed} que busca hogar.${who}${where}${who || where ? '.' : ''} Solicita su adopción en línea con AdoptaFácil.`;
}

/** Páginas públicas fijas. @type {Record<string, { title: string; description: string }>} */
export const STATIC_PAGES = {
  '/': {
    title: 'Adopción de perros y gatos en Colombia',
    description:
      'Adopta perros y gatos de refugios, fundaciones y rescatistas de toda Colombia. Conoce su historia, solicita en línea y firma un contrato claro. Gratis.',
  },
  '/campanas': {
    title: 'Campañas de recaudación para animales rescatados',
    description:
      'Apoya cirugías, alimento y esterilizaciones de organizaciones de rescate animal en Colombia. Cada campaña muestra su meta, su avance y en qué se gastó.',
  },
  '/guias': {
    title: 'Guías para adoptar y cuidar a tu perro',
    description:
      'Guías claras para adoptar un perro en Colombia y cuidarlo después: pasos, requisitos, primeros días, cachorros y perros adultos.',
  },
};
