import { useEffect, useState } from 'react';
import type {
  AnimalSummary,
  CampaignPublic,
  OrganizationPublic,
  ProductPublic,
  PublicReview,
  ResourceNeedPublic,
} from '@adoptafacil/contracts';
import { fetchPublicAnimals } from '../api/public-animals';
import { fetchPublicOrgCampaigns } from '../api/public-campaigns';
import { fetchPublicReviews } from '../api/public-reviews';
import { fetchPublicLedger } from '../../ledger/api/public-ledger';
import { listPublicNeeds } from '../../resources/api/public-resources';
import { listPublicProducts } from '../../marketplace/api/public-marketplace';
import type { TemplateSourceData } from './engine/model';

/** La API pública entrega como máximo 50 animales por página. */
const ANIMAL_PAGE = 50;
/** Tope de animales que una plantilla carga de una vez (rendimiento). */
const ANIMAL_CAP = 200;

export type TemplateSourceState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: TemplateSourceData };

/**
 * Carga, con los MISMOS endpoints públicos que usa el portal clásico, todo lo que
 * una plantilla muestra. Cada bloque secundario es "best-effort" igual que en el
 * clásico: si falla, esa sección cae a su estado vacío en vez de romper el portal.
 * Todo se consulta por el slug / id de ESTA organización: nunca se mezcla
 * información de otra.
 */
export function useTemplateSource(
  slug: string,
  organization: OrganizationPublic,
): TemplateSourceState {
  const [state, setState] = useState<TemplateSourceState>({ status: 'loading' });

  useEffect(() => {
    const ctl = new AbortController();
    const { signal } = ctl;
    setState({ status: 'loading' });

    const animals = (async () => {
      const items: AnimalSummary[] = [];
      let total = 0;
      for (let offset = 0; offset < ANIMAL_CAP; offset += ANIMAL_PAGE) {
        const page = await fetchPublicAnimals({ slug, limit: ANIMAL_PAGE, offset, signal });
        total = page.total;
        // Defensa en profundidad: solo animales de ESTA organización.
        items.push(...page.items.filter((a) => a.organizationId === organization.id));
        if (page.items.length < ANIMAL_PAGE || items.length >= total) break;
      }
      return { items, total };
    })().catch(() => ({ items: [] as AnimalSummary[], total: 0 }));

    const campaigns = fetchPublicOrgCampaigns({ slug, limit: 12, offset: 0, signal })
      .then((p) => p.items.filter((c) => c.organizationId === organization.id))
      .catch(() => [] as CampaignPublic[]);
    const needs = listPublicNeeds({ organizationId: organization.id, limit: 12, offset: 0, signal })
      .then((p) => p.items.filter((n) => n.organizationId === organization.id))
      .catch(() => [] as ResourceNeedPublic[]);
    const products = listPublicProducts({
      organizationId: organization.id,
      limit: 12,
      offset: 0,
      signal,
    })
      .then((p) => p.items.filter((x) => x.organizationId === organization.id))
      .catch(() => [] as ProductPublic[]);
    const reviews = fetchPublicReviews(slug, 30, signal)
      .then((p) => p.items)
      .catch(() => [] as PublicReview[]);

    const ledger = fetchPublicLedger(slug, { limit: 5, signal }).catch(() => null);

    Promise.all([animals, campaigns, needs, products, reviews, ledger])
      .then(([a, c, n, p, r, l]) => {
        if (signal.aborted) return;
        setState({
          status: 'ready',
          data: {
            slug,
            organization,
            animals: a.items,
            animalTotal: a.total,
            campaigns: c,
            needs: n,
            products: p,
            reviews: r,
            ledger: l,
          },
        });
      })
      .catch(() => {
        if (!signal.aborted) setState({ status: 'error' });
      });

    return () => ctl.abort();
  }, [slug, organization]);

  return state;
}
