import type { OrganizationPublic } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Proyección PÚBLICA de una organización por slug (§M14) — `GET
 * /public/organizations/:slug`, sin auth. La misma que consume `OrgPublicPage`.
 * Devuelve `null` en un 404 (slug inexistente o portal no publicado) y lanza
 * solo ante un error real de red/servidor.
 */
export async function fetchPublicOrganization(slug: string): Promise<OrganizationPublic | null> {
  const response = await fetch(`${API_BASE}/public/organizations/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as OrganizationPublic;
}
