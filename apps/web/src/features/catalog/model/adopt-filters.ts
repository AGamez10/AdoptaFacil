import type {
  AnimalSex,
  AnimalSize,
  AnimalSpecies,
  PublicAnimalSummary,
} from '@adoptafacil/contracts';

/**
 * URLs limpias del listado público de adopción, en palabras de la gente:
 *   /adoptar                     → todos los animales
 *   /adoptar/perros              → perros en todo Colombia
 *   /adoptar/perros/bogota       → perros en Bogotá
 *   /adoptar/animales/medellin   → todas las especies en Medellín
 * Sirven para compartir y para que los buscadores tengan una página por
 * especie y ciudad.
 */
export const ADOPT_BASE_PATH = '/adoptar';

export type SpeciesSlug = 'perros' | 'gatos' | 'otros' | 'animales';

export { SPECIES_SLUGS, buildAdoptPath, citySlug } from '../../../seo/page-meta.js';
import { citySlug } from '../../../seo/page-meta.js';

const SPECIES_BY_SLUG: Record<string, AnimalSpecies | undefined> = {
  perros: 'dog',
  gatos: 'cat',
  otros: 'other',
};

/** Nombre en plural para títulos ("Perros en adopción en Bogotá"). */
export { SPECIES_PLURAL } from '../../../seo/page-meta.js';

export function speciesFromSlug(slug: string | undefined): AnimalSpecies | 'all' | null {
  if (!slug || slug === 'animales') return 'all';
  return SPECIES_BY_SLUG[slug] ?? null;
}

export type AgeGroup = 'cachorro' | 'joven' | 'adulto' | 'mayor';

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  cachorro: 'Cachorro (menos de 1 año)',
  joven: 'Joven (1 a 3 años)',
  adulto: 'Adulto (3 a 8 años)',
  mayor: 'Mayor (8 años o más)',
};

export function ageGroupOf(animal: PublicAnimalSummary): AgeGroup | null {
  const months = animal.computedAge?.totalMonths;
  if (typeof months !== 'number') return null;
  if (months < 12) return 'cachorro';
  if (months < 36) return 'joven';
  if (months < 96) return 'adulto';
  return 'mayor';
}

export type SortKey = 'recientes' | 'jovenes' | 'mayores';

export const SORT_LABELS: Record<SortKey, string> = {
  recientes: 'Más recientes',
  jovenes: 'Más jóvenes primero',
  mayores: 'Mayores primero',
};

export interface AdoptFilters {
  species: AnimalSpecies | 'all';
  /** Nombre real de la ciudad (como lo publica la organización), o null. */
  city: string | null;
  size: AnimalSize | null;
  sex: AnimalSex | null;
  age: AgeGroup | null;
  query: string;
  sort: SortKey;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Filtra y ordena sobre datos reales ya cargados; nunca inventa campos. */
export function applyAdoptFilters(
  animals: readonly PublicAnimalSummary[],
  filters: AdoptFilters,
): PublicAnimalSummary[] {
  const needle = normalize(filters.query.trim());
  const cityKey = filters.city ? citySlug(filters.city) : null;
  const result = animals.filter((animal) => {
    if (filters.species !== 'all' && animal.species !== filters.species) return false;
    if (cityKey && citySlug(animal.organization.city ?? '') !== cityKey) return false;
    if (filters.size && animal.size !== filters.size) return false;
    if (filters.sex && animal.sex !== filters.sex) return false;
    if (filters.age && ageGroupOf(animal) !== filters.age) return false;
    if (needle) {
      const haystack = [
        animal.name,
        animal.breed,
        animal.organization.name,
        animal.organization.city,
      ]
        .filter(Boolean)
        .map((value) => normalize(value as string));
      if (!haystack.some((value) => value.includes(needle))) return false;
    }
    return true;
  });

  if (filters.sort === 'recientes') {
    return result.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }
  const age = (animal: PublicAnimalSummary) => animal.computedAge?.totalMonths;
  return result.sort((a, b) => {
    const left = age(a);
    const right = age(b);
    // Sin edad registrada, siempre al final.
    if (left === undefined) return right === undefined ? 0 : 1;
    if (right === undefined) return -1;
    return filters.sort === 'jovenes' ? left - right : right - left;
  });
}

/** Título de la página según especie y ciudad ("Perros en adopción en Bogotá"). */
export { adoptTitle } from '../../../seo/page-meta.js';
