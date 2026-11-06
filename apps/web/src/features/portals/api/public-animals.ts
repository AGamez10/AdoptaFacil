import type { AnimalSpecies, AnimalSummary, AnimalSummaryPage } from '@adoptafacil/contracts';

import type { ApiClient } from '../../../shell/api';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface FetchPublicAnimalsParams {
  slug: string;
  species?: AnimalSpecies;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
  /** Owner preview (see `PortalPreviewContext`): reads the caller's own
   *  organization through the authenticated preview endpoint. */
  preview?: ApiClient | null;
}

/**
 * Consume el catálogo PÚBLICO de animales adoptables de una organización (§M14/M03,
 * RF07): `GET /public/organizations/:slug/animals` (endpoint de @sebastian, #38). Sin
 * token (portal público). La respuesta viene ENVUELTA
 * (`{ items, total, limit, offset }`), NO como array.
 *
 * ⚠️ Blindaje anti-regresión (patrón del bug .map de T-028c): SIEMPRE se normaliza
 * `.items` a `[]` si no es un array, para que ningún consumidor haga `.map` sobre un
 * no-array. El backend ya excluye lo clínico/interno; aquí solo se pasan campos
 * públicos de `AnimalSummary`.
 */
export async function fetchPublicAnimals({
  slug,
  species,
  limit,
  offset,
  signal,
  preview,
}: FetchPublicAnimalsParams): Promise<AnimalSummaryPage> {
  const params = new URLSearchParams();
  if (species) params.set('species', species);
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  const qs = params.toString();
  const url = `${API_BASE}/public/organizations/${encodeURIComponent(slug)}/animals${
    qs ? `?${qs}` : ''
  }`;

  let body: Partial<AnimalSummaryPage> | null;
  if (preview) {
    body = await preview.request<Partial<AnimalSummaryPage> | null>(
      `/org/portal/preview/animals${qs ? `?${qs}` : ''}`,
      signal ? { signal } : {},
    );
  } else {
    const response = await fetch(url, signal ? { signal } : undefined);
    if (!response.ok) {
      throw new Error('error');
    }
    body = (await response.json()) as Partial<AnimalSummaryPage> | null;
  }

  const items: AnimalSummary[] = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}

/**
 * Ficha PÚBLICA de un animal adoptable: `GET /public/organizations/:slug/animals/:ref`,
 * con `ref` = código público o id (enlaces viejos). `null` cuando la API responde
 * 404 (adoptado, retirado, de otra organización o inexistente: la API no los
 * distingue); cualquier otro fallo lanza para que la página muestre el error.
 */
export async function fetchPublicAnimal(
  slug: string,
  ref: string,
  signal?: AbortSignal,
): Promise<AnimalSummary | null> {
  const url = `${API_BASE}/public/organizations/${encodeURIComponent(slug)}/animals/${encodeURIComponent(ref)}`;
  const response = await fetch(url, signal ? { signal } : undefined);
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) {
    throw new Error('error');
  }
  return (await response.json()) as AnimalSummary;
}

/** La API pública entrega como máximo 50 animales por página. */
const PUBLIC_ANIMAL_PAGE = 50;
/** Tope de seguridad (40 páginas): ninguna organización real se acerca. */
const PUBLIC_ANIMAL_MAX = 2000;

/**
 * TODOS los animales adoptables de una organización, página por página, hasta
 * el último. Las plantillas filtran, ordenan y paginan en el navegador, así que
 * necesitan el conjunto completo: si solo llegara la primera página, el titular
 * contaría más animales de los que el catálogo deja ver. Solo se conservan los
 * de `organizationId` (defensa en profundidad: nunca se mezcla otra).
 */
export async function fetchAllPublicAnimals({
  organizationId,
  ...params
}: Omit<FetchPublicAnimalsParams, 'limit' | 'offset'> & {
  organizationId: string;
}): Promise<AnimalSummary[]> {
  const items: AnimalSummary[] = [];
  let offset = 0;
  while (offset < PUBLIC_ANIMAL_MAX) {
    const page = await fetchPublicAnimals({ ...params, limit: PUBLIC_ANIMAL_PAGE, offset });
    items.push(...page.items.filter((a) => a.organizationId === organizationId));
    // Avanza por lo que de verdad llegó (el servidor puede recortar el límite).
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) break;
  }
  return items;
}
