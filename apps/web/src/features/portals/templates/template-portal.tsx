import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { OrganizationPublic, PortalTemplateId, Review } from '@adoptafacil/contracts';
import { Skeleton } from '@adoptafacil/ui';
import type { TemplateDesign } from './engine/types';
import type { TemplateSourceData } from './engine/model';
import { PortalTemplateView } from './portal-template-view';
import { isEngineTemplate, loadDesign } from './registry';
import { useTemplateSource } from './use-template-source';

export interface TemplatePortalProps {
  template: PortalTemplateId;
  slug: string;
  organization: OrganizationPublic;
  themeStyle: CSSProperties;
  /** Video de portada del tema (Historias, Documental), ya saneado. */
  coverVideo?: TemplateSourceData['coverVideo'];
  /** Segundo video (Documental). */
  coverVideo2?: TemplateSourceData['coverVideo2'];
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
  coverVideo = null,
  coverVideo2 = null,
  fallback,
}: TemplatePortalProps) {
  const [design, setDesign] = useState<TemplateDesign | null | 'failed'>(null);
  const source = useTemplateSource(slug, organization);
  const [data, setData] = useState<TemplateSourceData | null>(null);

  useEffect(() => {
    if (!isEngineTemplate(template)) {
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

  const videoUrl = coverVideo?.url;
  const videoPoster = coverVideo?.poster;
  const video2Url = coverVideo2?.url;
  const video2Poster = coverVideo2?.poster;
  useEffect(() => {
    setData(
      source.status === 'ready'
        ? {
            ...source.data,
            coverVideo: videoUrl ? { url: videoUrl, poster: videoPoster } : null,
            coverVideo2: video2Url ? { url: video2Url, poster: video2Poster } : null,
          }
        : null,
    );
  }, [source, videoUrl, videoPoster, video2Url, video2Poster]);

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
                isCommunityMember: false,
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
