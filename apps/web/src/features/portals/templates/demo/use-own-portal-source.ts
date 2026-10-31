import { useEffect, useState } from 'react';
import type {
  CampaignPublic,
  OrganizationPublic,
  ProductPublic,
  ResourceNeedPublic,
} from '@adoptafacil/contracts';
import { useApiClient } from '../../../../shell/api';
import { listPublicProducts } from '../../../marketplace/api/public-marketplace';
import { listPublicNeeds } from '../../../resources/api/public-resources';
import { fetchPublicAnimals } from '../../api/public-animals';
import { fetchPublicOrgCampaigns } from '../../api/public-campaigns';
import type { TemplateSourceData } from '../engine/model';

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
      const animals = await fetchPublicAnimals({
        slug,
        preview: client,
        limit: 50,
        offset: 0,
        signal,
      });
      if (animals.total === 0 || animals.items.length === 0) return null;
      const [campaigns, needs, products] = await Promise.all([
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
      ]);
      const own = (x: { organizationId: string }) => x.organizationId === organization.id;
      const data: TemplateSourceData = {
        slug,
        organization,
        animals: animals.items.filter(own),
        animalTotal: animals.total,
        campaigns: campaigns.filter(own),
        needs: needs.filter(own),
        products: products.filter(own),
        reviews: [],
        ledger: null,
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
