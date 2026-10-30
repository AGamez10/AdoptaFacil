type SpeciesKey = 'dog' | 'cat' | 'other';
type SpeciesOrAll = SpeciesKey | 'all';

export declare const SPECIES_SLUGS: Record<SpeciesKey, 'perros' | 'gatos' | 'otros'>;
export declare function citySlug(city: string): string;
export declare function buildAdoptPath(species: SpeciesOrAll, city?: string | null): string;
export declare const PUBLIC_CODE_PATTERN: RegExp;
type AnimalUrlInput = { id: string; name: string; publicCode?: string };
export declare function animalUrlSegment(animal: AnimalUrlInput): string;
export declare function publicAnimalPath(orgSlug: string, animal: AnimalUrlInput): string;
export declare function parseAnimalUrlSegment(
  segment: string | undefined,
): { ref: string; legacy: boolean } | null;
export declare const SPECIES_PLURAL: Record<SpeciesOrAll, string>;
export declare const SPECIES_SINGULAR: Record<SpeciesKey, string>;
export declare function adoptTitle(species: SpeciesOrAll, city: string | null | undefined): string;
export declare function adoptDescription(
  species: SpeciesOrAll,
  city: string | null | undefined,
  count: number | null | undefined,
): string;
export declare function animalTitle(
  animal: { name: string; species: SpeciesKey; breed?: string },
  city: string | null | undefined,
): string;
export declare function animalDescription(
  animal: { name: string; species: SpeciesKey; breed?: string },
  orgName: string | null | undefined,
  city: string | null | undefined,
): string;
export declare const STATIC_PAGES: Record<
  '/' | '/campanas' | '/guias',
  { title: string; description: string }
>;
