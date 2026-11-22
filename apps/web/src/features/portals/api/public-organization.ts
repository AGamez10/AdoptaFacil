import type { OrganizationPublic } from '@adoptafacil/contracts';
import { fetchEarlyOr, portalProfileUrl } from './early-fetch';

/**
 * Proyección PÚBLICA de una organización por slug (§M14) — `GET
 * /public/organizations/:slug`, sin auth. La misma que consume `OrgPublicPage`.
 * Devuelve `null` en un 404 (slug inexistente o portal no publicado) y lanza
 * solo ante un error real de red/servidor.
 */
export async function fetchPublicOrganization(slug: string): Promise<OrganizationPublic | null> {
  const response = await fetchEarlyOr(portalProfileUrl(slug));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as OrganizationPublic;
}
