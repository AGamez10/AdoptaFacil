import type {
  ServiceCategory,
  ServiceListingPublic,
  ServiceListingsPage,
  ServiceReviewsPage,
} from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface ListPublicServicesParams {
  category?: ServiceCategory;
  city?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * Directorio PÚBLICO de servicios (Comunidad): `GET /public/community/services`.
 * Sin token. Mismo blindaje que el resto de catálogos públicos: `.items`
 * siempre es un array.
 */
export async function listPublicServices({
  category,
  city,
  limit,
  offset,
  signal,
}: ListPublicServicesParams = {}): Promise<ServiceListingsPage> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (city?.trim()) params.set('city', city.trim());
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  const qs = params.toString();
  const response = await fetch(
    `${API_BASE}/public/community/services${qs ? `?${qs}` : ''}`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) throw new Error('error');
  const body = (await response.json()) as Partial<ServiceListingsPage> | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}

/** Un perfil aprobado por id, o `null` si no existe o no está publicado. */
export async function getPublicService(
  id: string,
  signal?: AbortSignal,
): Promise<ServiceListingPublic | null> {
  const response = await fetch(
    `${API_BASE}/public/community/services/${encodeURIComponent(id)}`,
    signal ? { signal } : undefined,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as ServiceListingPublic;
}

/** Reseñas aprobadas de un perfil. */
export async function listPublicServiceReviews(
  id: string,
  signal?: AbortSignal,
): Promise<ServiceReviewsPage> {
  const response = await fetch(
    `${API_BASE}/public/community/services/${encodeURIComponent(id)}/reviews?limit=20`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) throw new Error('error');
  const body = (await response.json()) as Partial<ServiceReviewsPage> | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}
