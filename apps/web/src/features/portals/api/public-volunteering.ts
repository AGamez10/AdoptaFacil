import type { Paginated, VolunteerOpportunityPublic } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Voluntariados ABIERTOS de una organización para su portal público:
 * `GET /public/organizations/:slug/volunteer-opportunities` (sin token). Solo
 * activos y cuya fecha de fin no ha pasado. `.items` siempre normalizado a `[]`.
 */
export async function fetchPublicOrgVolunteering({
  slug,
  limit = 12,
  signal,
}: {
  slug: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<VolunteerOpportunityPublic[]> {
  const response = await fetch(
    `${API_BASE}/public/organizations/${encodeURIComponent(slug)}/volunteer-opportunities?limit=${limit}`,
    signal ? { signal } : {},
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as Partial<Paginated<VolunteerOpportunityPublic>> | null;
  return Array.isArray(body?.items) ? body.items : [];
}
