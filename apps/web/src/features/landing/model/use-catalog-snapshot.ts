import { useEffect, useMemo, useState } from 'react';
import type { PublicAnimalOrganizationSummary, PublicAnimalSummary } from '@adoptafacil/contracts';
import { fetchGlobalPublicAnimals } from '../../catalog/api/public-animals';

/** Tope real del endpoint público (`GET /public/animals`). */
const SNAPSHOT_LIMIT = 50;

export interface CatalogSnapshot {
  status: 'loading' | 'ready' | 'error';
  /** Animales de la primera página (hasta 50), los más recientes primero. */
  animals: PublicAnimalSummary[];
  /** Total REAL de animales adoptables en todas las organizaciones. */
  total: number;
  /** Organizaciones que hoy tienen al menos un animal publicado. */
  organizations: PublicAnimalOrganizationSummary[];
  /** Ciudades con animales publicados, de la que más tiene a la que menos. */
  cities: { city: string; count: number }[];
}

/**
 * Una sola lectura del catálogo público para toda la landing: el hero, la
 * fila "Te están esperando", las cifras y las organizaciones salen de los
 * mismos datos reales. Ninguna cifra se inventa: sin datos, cada sección
 * decide no mostrarse.
 */
export function useCatalogSnapshot(): CatalogSnapshot {
  const [state, setState] = useState<Pick<CatalogSnapshot, 'status' | 'animals' | 'total'>>({
    status: 'loading',
    animals: [],
    total: 0,
  });

  useEffect(() => {
    const controller = new AbortController();
    fetchGlobalPublicAnimals({ limit: SNAPSHOT_LIMIT, page: 1, signal: controller.signal })
      .then((page) => setState({ status: 'ready', animals: page.data, total: page.total }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error', animals: [], total: 0 });
      });
    return () => controller.abort();
  }, []);

  return useMemo(() => {
    const orgs = new Map<string, PublicAnimalOrganizationSummary>();
    const cityCounts = new Map<string, number>();
    for (const animal of state.animals) {
      orgs.set(animal.organization.id, animal.organization);
      const city = animal.organization.city;
      if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
    }
    return {
      ...state,
      organizations: Array.from(orgs.values()),
      cities: Array.from(cityCounts.entries())
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)),
    };
  }, [state]);
}
