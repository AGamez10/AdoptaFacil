import type { Paginated, VolunteerOpportunityPublic } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface FetchPublicOrgVolunteeringParams {
  slug: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * Jornadas de voluntariado ABIERTAS de una organización, para su portal público:
 * `GET /public/organizations/:slug/volunteer-opportunities`. Sin token.
 * Normaliza `.items` a `[]` si no es un array (mismo blindaje que
 * `fetchPublicOrgCampaigns`).
 */
export async function fetchPublicOrgVolunteering({
  slug,
  limit,
  offset,
  signal,
}: FetchPublicOrgVolunteeringParams): Promise<Paginated<VolunteerOpportunityPublic>> {
  const params = new URLSearchParams();
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  const qs = params.toString();
  const url = `${API_BASE}/public/organizations/${encodeURIComponent(slug)}/volunteer-opportunities${
    qs ? `?${qs}` : ''
  }`;
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error('error');
  }
  const body = (await response.json()) as Partial<Paginated<VolunteerOpportunityPublic>> | null;
  const items: VolunteerOpportunityPublic[] = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}
