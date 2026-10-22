type SpeciesKey = 'dog' | 'cat' | 'other';
type SpeciesOrAll = SpeciesKey | 'all';

export declare const SPECIES_SLUGS: Record<SpeciesKey, 'perros' | 'gatos' | 'otros'>;
export declare function citySlug(city: string): string;
export declare function buildAdoptPath(species: SpeciesOrAll, city?: string | null): string;
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
