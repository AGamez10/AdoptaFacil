import type {
  AdopterBenefitsPage,
  BusinessBenefitPublic,
  BusinessImpact,
} from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Negocios aliados · lecturas PÚBLICAS (sin token): la vitrina de beneficios
 * para quien adopta, los beneficios de un perfil y su impacto comprobable.
 * Mismo blindaje que el resto de catálogos públicos: arrays siempre arrays.
 */
export async function listAdopterBenefits({
  city,
  limit = 24,
  signal,
}: { city?: string; limit?: number; signal?: AbortSignal } = {}): Promise<AdopterBenefitsPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (city?.trim()) params.set('city', city.trim());
  const response = await fetch(
    `${API_BASE}/public/community/benefits?${params.toString()}`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) throw new Error('error');
  const body = (await response.json()) as Partial<AdopterBenefitsPage> | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}

export async function getListingBenefits(
  listingId: string,
  signal?: AbortSignal,
): Promise<BusinessBenefitPublic[]> {
  const response = await fetch(
    `${API_BASE}/public/community/services/${encodeURIComponent(listingId)}/benefits`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) return [];
  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as BusinessBenefitPublic[]) : [];
}

export async function getListingImpact(
  listingId: string,
  signal?: AbortSignal,
): Promise<BusinessImpact | null> {
  const response = await fetch(
    `${API_BASE}/public/community/services/${encodeURIComponent(listingId)}/impact`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) return null;
  return (await response.json()) as BusinessImpact;
}
