import { useEffect, useState } from 'react';
import type {
  CampaignPublic,
  OrgLedgerPage,
  OrganizationPublic,
  ProductPublic,
  PublicLedgerPage,
  PublicReview,
  ResourceNeedPublic,
  VolunteerOpportunityPublic,
} from '@adoptafacil/contracts';
import { useApiClient } from '../../../../shell/api';
import { fetchPublicLedger } from '../../../ledger/api/public-ledger';
import { listPublicProducts } from '../../../marketplace/api/public-marketplace';
import { listPublicNeeds } from '../../../resources/api/public-resources';
import { fetchAllPublicAnimals } from '../../api/public-animals';
import { fetchPublicOrgCampaigns } from '../../api/public-campaigns';
import { fetchPublicReviews } from '../../api/public-reviews';
import { fetchPublicOrgVolunteering } from '../../api/public-volunteering';
import type { TemplateSourceData } from '../engine/model';

/** Tope del libro en la vista previa (el mismo máximo por página de la API pública). */
const PREVIEW_LEDGER_LIMIT = 100;

/**
 * Libro de la vista previa con la MISMA forma y orden del libro público. El
 * libro sin sesión solo responde cuando la organización ya está aprobada;
 * antes, se lee el de la propia organización (autenticado, bajo RLS) para que
 * la vista previa muestre exactamente lo que verá el público.
 */
export function orgLedgerAsPublic(
  page: OrgLedgerPage,
  limit = PREVIEW_LEDGER_LIMIT,
): PublicLedgerPage {
  const sorted = [...page.items].sort(
    (a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt),
  );
  const items = sorted.slice(0, limit).map((e) => ({
    id: e.id,
    source: e.source,
    kind: e.kind,
    category: e.category,
    occurredOn: e.occurredOn,
    amountCop: e.amountCop,
    concept: e.concept,
    ...(e.counterparty ? { counterparty: e.counterparty } : {}),
    hasSupport: e.hasSupport,
    createdAt: e.createdAt,
    voided: Boolean(e.voidedAt),
    ...(e.voidReason ? { voidReason: e.voidReason } : {}),
  }));
  return { items, total: page.items.length, limit, offset: 0, totals: page.totals };
}

export type OwnPortalSource =
  | { status: 'loading' }
  /** Sin animales registrados (o sin organización): se muestran los datos de ejemplo. */
  | { status: 'none' }
  | { status: 'ready'; data: TemplateSourceData };

/**
 * Datos REALES del portal de la propia organización para las vistas previas
 * de plantillas. Se leen por los endpoints de vista previa autenticados (bajo
 * RLS), así funcionan aunque la plataforma aún no haya aprobado la
 * organización. Regla del dueño: los datos de ejemplo solo se muestran
 * mientras la organización no ha registrado ni un animal; desde el primero,
 * la vista previa es 100 % suya (nunca se mezclan datos reales con los de
 * ejemplo: lo que no tenga queda vacío, como en su portal).
 */
export function useOwnPortalSource(enabled: boolean): OwnPortalSource {
  const client = useApiClient();
  const [state, setState] = useState<OwnPortalSource>(
    enabled ? { status: 'loading' } : { status: 'none' },
  );

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'none' });
      return;
    }
    const ctl = new AbortController();
    const { signal } = ctl;
    setState({ status: 'loading' });
    (async () => {
      const organization = await client.request<OrganizationPublic>('/org/portal/preview', {
        signal,
      });
      if (!organization?.id) return null;
      const slug = organization.slug || 'tu-organizacion';
      // Todos sus animales, hasta el último: el titular, el catálogo y "ver más"
      // de cada plantilla cuentan exactamente los mismos.
      const animals = await fetchAllPublicAnimals({
        slug,
        organizationId: organization.id,
        preview: client,
        signal,
      });
      if (animals.length === 0) return null;
      const own = (x: { organizationId: string }) => x.organizationId === organization.id;
      const [campaigns, needs, products, reviews, volunteering, ledger] = await Promise.all([
        fetchPublicOrgCampaigns({ slug, preview: client, limit: 12, offset: 0, signal })
          .then((page) => page.items)
          .catch(() => [] as CampaignPublic[]),
        // Necesidades y productos solo tienen lectura pública: aparecen cuando
        // la organización ya está aprobada; antes, la sección queda vacía.
        listPublicNeeds({ organizationId: organization.id, limit: 12, offset: 0, signal })
          .then((page) => page.items)
          .catch(() => [] as ResourceNeedPublic[]),
        listPublicProducts({ organizationId: organization.id, limit: 12, offset: 0, signal })
          .then((page) => page.items)
          .catch(() => [] as ProductPublic[]),
        fetchPublicReviews(slug, 30, signal)
          .then((page) => page.items)
          .catch(() => [] as PublicReview[]),
        fetchPublicOrgVolunteering({ slug, limit: 12, signal })
          .then((items) => items.filter(own))
          .catch(() => [] as VolunteerOpportunityPublic[]),
        // El libro: el MISMO que ve el público (y el que abre "Ver libro completo").
        fetchPublicLedger(slug, { limit: PREVIEW_LEDGER_LIMIT, signal })
          .catch(() =>
            client
              .request<OrgLedgerPage>('/org/ledger', { signal })
              .then((page) => (page?.items ? orgLedgerAsPublic(page) : null)),
          )
          .catch(() => null),
      ]);
      const data: TemplateSourceData = {
        slug,
        organization,
        animals,
        animalTotal: animals.length,
        campaigns: campaigns.filter(own),
        needs: needs.filter(own),
        products: products.filter(own),
        volunteering,
        reviews,
        ledger,
      };
      return data;
    })()
      .then((data) => {
        if (!signal.aborted) setState(data ? { status: 'ready', data } : { status: 'none' });
      })
      .catch(() => {
        if (!signal.aborted) setState({ status: 'none' });
      });
    return () => ctl.abort();
  }, [enabled, client]);

  return state;
}
