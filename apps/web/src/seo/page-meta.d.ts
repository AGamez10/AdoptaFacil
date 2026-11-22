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
  | '/'
  | '/ayudar'
  | '/campanas'
  | '/guias'
  | '/para-organizaciones'
  | '/transparencia-nacional'
  | '/voluntariados',
  { title: string; description: string }
>;
export declare const HOME_FAQ: { q: string; a: string }[];
export declare const ORGANIZATION_DESCRIPTION: string;
type PortalOrgInput = {
  name: string;
  slug?: string;
  description?: string;
  logoUrl?: string;
  coverPhotos?: string[];
  location?: { city?: string; department?: string; country?: string };
  socialLinks?: object;
};
export declare function portalTitle(org: PortalOrgInput): string;
export declare function portalDescription(org: PortalOrgInput, animals?: number | null): string;
export declare function shelterLd(
  org: PortalOrgInput,
  path: string,
  abs: (path: string) => string,
): Record<string, unknown>;
type CampaignInput = {
  title: string;
  description?: string;
  organizationName: string;
  goalAmount: number;
  raisedAmount: number;
};
export declare function campaignTitle(campaign: CampaignInput): string;
export declare function campaignDescription(campaign: CampaignInput): string;
