import { useEffect, useState } from 'react';
import type { AnimalSpecies, PublicAnimalSummary } from '@adoptafacil/contracts';
import { fetchGlobalPublicAnimals } from '../api/public-animals';

/** Tope real por página de `GET /public/animals`. */
const PAGE_SIZE = 50;
/** Hasta 500 animales por especie: de sobra para la red actual y acotado
 *  para no encadenar peticiones sin fin si el catálogo crece mucho. */
const MAX_PAGES = 10;

export interface AdoptableAnimals {
  status: 'loading' | 'ready' | 'error';
  animals: PublicAnimalSummary[];
  /** Total real informado por la API (puede superar lo cargado). */
  total: number;
}

/**
 * Carga el catálogo público de una especie completo (página a página) para
 * que los filtros, los conteos por ciudad y el mapa trabajen sobre todos los
 * animales y no solo sobre los primeros 50. La ciudad se filtra en el
 * navegador para que el mapa pueda mostrar todas las ciudades a la vez.
 */
export function useAdoptableAnimals(species: AnimalSpecies | 'all'): AdoptableAnimals {
  const [state, setState] = useState<AdoptableAnimals>({
    status: 'loading',
    animals: [],
    total: 0,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, status: 'loading' }));

    async function load() {
      const animals: PublicAnimalSummary[] = [];
      let total = 0;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const result = await fetchGlobalPublicAnimals({
          species: species === 'all' ? undefined : species,
          page,
          limit: PAGE_SIZE,
          signal: controller.signal,
        });
        animals.push(...result.data);
        total = result.total;
        if (result.data.length < PAGE_SIZE || animals.length >= total) break;
      }
      return { animals, total };
    }

    load()
      .then(({ animals, total }) => {
        if (!controller.signal.aborted) setState({ status: 'ready', animals, total });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error', animals: [], total: 0 });
      });
    return () => controller.abort();
  }, [species]);

  return state;
}
