import type { Paginated, VolunteerOpportunityPublic } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface ListPublicVolunteerOpportunitiesParams {
  /** Slug del portal de UNA organización; sin él, el feed global. */
  slug?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * Consume el feed PÚBLICO de voluntariado (RF18, M08): sin `slug`,
 * `GET /public/volunteer-opportunities` (todas las organizaciones); con
 * `slug`, `GET /public/organizations/:slug/volunteer-opportunities`. Sin token.
 * Solo oportunidades ACTIVAS y columnas públicas (las decide la función SQL).
 * Mismo envoltorio que `GET /public/campaigns`: `Paginated<...>`.
 *
 * ⚠️ Blindaje anti-regresión (patrón T-028c/T-052): SIEMPRE se normaliza
 * `.items` a `[]` si no es un array, para que ningún consumidor haga `.map`
 * sobre un no-array.
 */
export async function listPublicVolunteerOpportunities({
  slug,
  limit,
  offset,
  signal,
}: ListPublicVolunteerOpportunitiesParams = {}): Promise<Paginated<VolunteerOpportunityPublic>> {
  const params = new URLSearchParams();
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  const qs = params.toString();
  const path = slug
    ? `/public/organizations/${encodeURIComponent(slug)}/volunteer-opportunities`
    : '/public/volunteer-opportunities';
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;

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
