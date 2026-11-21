import { useEffect, useMemo, useState } from 'react';
import type { PublicAdoptionNetwork, PublicNetworkOrganization } from '@adoptafacil/contracts';
import type { CatalogSnapshot } from './use-catalog-snapshot';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface AdoptionNetworkView {
  animals: number;
  /** null when the number is not known for sure (never a guess). */
  organizations: number | null;
  cities: { city: string; count: number }[];
  items: PublicNetworkOrganization[];
}

/**
 * Lo que muestra "Rescatistas de todo el país". Pide `GET /public/network`
 * (cifras de TODA la red) solo cuando `enabled` (la sección se acerca a la
 * pantalla). Mientras llega, o si falla, usa la primera página del catálogo
 * que la landing ya tiene: sus conteos por organización y ciudad solo son
 * exactos si esa página trae TODOS los animales; si no, no se muestran.
 */
export function useAdoptionNetwork(
  snapshot: CatalogSnapshot,
  enabled: boolean,
): AdoptionNetworkView {
  const [network, setNetwork] = useState<PublicAdoptionNetwork | null>(null);

  useEffect(() => {
    if (!enabled || network) return;
    const controller = new AbortController();
    fetch(`${API_BASE}/public/network`, { signal: controller.signal })
      .then((response) =>
        response.ok ? (response.json() as Promise<PublicAdoptionNetwork>) : null,
      )
      .then((body) => {
        if (body && Array.isArray(body.items) && Array.isArray(body.cities)) setNetwork(body);
      })
      .catch(() => {
        // Best-effort: se queda la vista armada con el catálogo.
      });
    return () => controller.abort();
  }, [enabled, network]);

  return useMemo(() => {
    if (network) {
      return {
        animals: network.animals,
        organizations: network.organizations,
        cities: network.cities,
        items: network.items,
      };
    }
    const complete = snapshot.animals.length >= snapshot.total;
    const byOrg = new Map<string, PublicNetworkOrganization>();
    for (const animal of snapshot.animals) {
      const org = animal.organization;
      const entry = byOrg.get(org.id) ?? {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl,
        city: org.city,
        animals: 0,
        photos: [],
      };
      entry.animals += 1;
      if (animal.photoUrl && entry.photos.length < 3) entry.photos.push(animal.photoUrl);
      byOrg.set(org.id, entry);
    }
    const items = Array.from(byOrg.values())
      .sort((a, b) => b.animals - a.animals)
      .slice(0, 12)
      // Sin la red completa, el número por organización podría quedarse corto.
      .map((org) => (complete ? org : { ...org, animals: 0 }));
    return {
      animals: snapshot.total,
      organizations: complete ? byOrg.size : null,
      cities: complete ? snapshot.cities : [],
      items,
    };
  }, [network, snapshot]);
}
