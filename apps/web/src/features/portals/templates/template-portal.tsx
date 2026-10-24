import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type {
  OrganizationPublic,
  PortalDesignId,
  PortalPremiumDesignId,
  Review,
} from '@adoptafacil/contracts';
import { Skeleton } from '@adoptafacil/ui';
import type { TemplateDesign } from './engine/types';
import type { TemplateSourceData } from './engine/model';
import { PortalTemplateView } from './portal-template-view';
import { loadDesign } from './registry';
import { useTemplateSource } from './use-template-source';

export interface TemplatePortalProps {
  template: PortalDesignId | PortalPremiumDesignId;
  slug: string;
  organization: OrganizationPublic;
  themeStyle: CSSProperties;
  /** Lo que se pinta si la plantilla no se puede usar (siempre el portal clásico). */
  fallback: ReactNode;
}

/**
 * Portal público con plantilla. Si la plantilla no existe, no carga, o los datos
 * no se pueden traer, se pinta el portal clásico (`fallback`): una organización
 * nunca queda con su portal caído por culpa del diseño elegido.
 */
export function TemplatePortal({
  template,
  slug,
  organization,
  themeStyle,
  fallback,
}: TemplatePortalProps) {
  const [design, setDesign] = useState<TemplateDesign | null | 'failed'>(null);
  const source = useTemplateSource(slug, organization);
  const [data, setData] = useState<TemplateSourceData | null>(null);

  useEffect(() => {
    // Premium apagada: `loadDesign` la rechaza y se pinta el clásico.
    if (template === 'clasico') {
      setDesign('failed');
      return;
    }
    let active = true;
    setDesign(null);
    loadDesign(template)
      .then((d) => {
        if (active) setDesign(d);
      })
      .catch(() => {
        if (active) setDesign('failed');
      });
    return () => {
      active = false;
    };
  }, [template]);

  useEffect(() => {
    setData(source.status === 'ready' ? source.data : null);
  }, [source]);

  const onReviewCreated = useCallback((created: Review) => {
    setData((cur) =>
      cur
        ? {
            ...cur,
            reviews: [
              {
                id: created.id,
                rating: created.rating,
                comment: created.comment,
                authorName: undefined,
                createdAt: created.createdAt,
              },
              ...cur.reviews,
            ],
          }
        : cur,
    );
  }, []);

  if (design === 'failed' || source.status === 'error') return <>{fallback}</>;
  if (!design || !data) {
    return (
      <div className="mx-auto w-full max-w-[1320px] px-4 py-10" aria-busy="true">
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  return (
    <PortalTemplateView
      design={design}
      source={data}
      themeStyle={themeStyle}
      onReviewCreated={onReviewCreated}
    />
  );
}
