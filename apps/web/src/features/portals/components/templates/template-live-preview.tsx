import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  AnimalSummary,
  OrganizationPublic,
  PortalLogoPosition,
  PortalTemplateId,
  PortalTemplateOptions,
  PortalTheme,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { brandTokensToStyle } from '../../../../shell/theme';
import { useApiClient } from '../../../../shell/api';
import { fetchPublicAnimals } from '../../api/public-animals';
import { buildPortalView } from '../../model/portal-view';
import { isEngineTemplate, loadDesign } from '../../templates/registry';
import type { TemplateDesign } from '../../templates/engine/types';
import type { TemplateSourceData } from '../../templates/engine/model';
import { PortalTemplateView } from '../../templates/portal-template-view';
import { AnimalCard } from '../animal-card';
import { PortalProfileSection } from '../portal-profile-section';
import {
  CarnetHero,
  EditorialHero,
  HistoriasHero,
  ImpactoHero,
  OrbitaHero,
} from './template-heroes';
import catalogStyles from '../../styles/public-catalog.module.scss';
import portalStyles from '../../styles/public-portal.module.scss';
import templateStyles from './portal-templates.module.scss';
import styles from './template-live-preview.module.scss';

const PORTAL_BASE_DOMAIN =
  (import.meta.env.VITE_PORTAL_BASE_DOMAIN as string | undefined) || 'adoptafacil.org';

type Device = 'desktop' | 'mobile';
const DEVICE_WIDTH: Record<Device, number> = { desktop: 1280, mobile: 390 };

export interface TemplateLivePreviewProps {
  slug?: string;
  orgName?: string;
  template: PortalTemplateId;
  options: PortalTemplateOptions;
  tokens: PortalTheme;
  logoPosition: PortalLogoPosition;
  /** Historias: video de portada elegido en el editor (aún sin guardar). */
  coverVideoUrl?: string;
}

/** Perfil de muestra mientras la organización no tiene datos públicos. */
function sampleOrganization(name: string | undefined): OrganizationPublic {
  return {
    id: 'preview',
    name: name ?? 'Tu organización',
    slug: 'tu-organizacion',
    description:
      'Así se verá la descripción de tu organización: quiénes son, a quién rescatan y cómo ayudar.',
    location: { city: 'Tu ciudad', department: 'Colombia', country: 'Colombia' },
  } as OrganizationPublic;
}

/**
 * Vista previa EN VIVO de la plantilla (Ola 3). Renderiza los mismos
 * componentes del portal público con los datos públicos reales de la
 * organización (perfil + primeros animales) y los cambios aún sin guardar:
 * plantilla, ajustes y colores. Se dibuja a tamaño real (1280 px o 390 px) y
 * se escala para caber en la tarjeta. Es solo para mirar: `inert`.
 */
export function TemplateLivePreview({
  slug,
  orgName,
  template,
  options,
  tokens,
  logoPosition,
  coverVideoUrl,
}: TemplateLivePreviewProps) {
  const [device, setDevice] = useState<Device>('desktop');
  const [organization, setOrganization] = useState<OrganizationPublic | null>(null);
  const [animals, setAnimals] = useState<AnimalSummary[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState(600);
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const client = useApiClient();

  // Reads the organization's OWN portal data (authenticated preview endpoints,
  // under RLS), so the editor shows real content even before the platform
  // approves the organization, when the public endpoints still answer 404.
  useEffect(() => {
    if (!slug) return;
    let active = true;
    client
      .request<OrganizationPublic>('/org/portal/preview')
      .then((data) => {
        if (active && data?.name) setOrganization(data);
      })
      .catch(() => undefined);
    fetchPublicAnimals({ slug, preview: client, limit: 8, offset: 0 })
      .then((page) => {
        if (!active) return;
        setAnimals(page.items);
        setTotal(page.total);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [slug, client]);

  const width = DEVICE_WIDTH[device];
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    const update = () => {
      const next = Math.min(1, frame.clientWidth / width);
      setScale(next);
      setHeight(Math.min(content.scrollHeight, device === 'mobile' ? 1500 : 1100) * next);
    };
    update();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, [width, device]);

  const profile = useMemo(
    () => buildPortalView(organization ?? sampleOrganization(orgName)).profile,
    [organization, orgName],
  );
  const style = useMemo(() => brandTokensToStyle(tokens), [tokens]);
  const previewSlug = slug ?? 'tu-organizacion';
  const actions = (
    <div className={portalStyles.heroActions}>
      <span className={cn(portalStyles.btn, portalStyles['btn--lg'], portalStyles['btn--primary'])}>
        Conocer a nuestros animales
      </span>
    </div>
  );
  const heroProps = {
    profile,
    slug: previewSlug,
    animalCount: total,
    animals,
    actions,
    options,
  };
  // Plantillas del motor: se pintan con el mismo componente que el portal público,
  // con los datos reales de la organización (sin reseñas ni campañas en la vista previa).
  const engine = isEngineTemplate(template) ? template : null;
  const engineSource = useMemo<TemplateSourceData>(
    () => ({
      slug: previewSlug,
      organization: (organization ?? sampleOrganization(orgName)) as OrganizationPublic,
      animals,
      animalTotal: total ?? animals.length,
      campaigns: [],
      needs: [],
      products: [],
      reviews: [],
    }),
    [previewSlug, organization, orgName, animals, total],
  );

  return (
    <div className={styles.preview} data-testid="template-live-preview">
      <div className={styles.toolbar}>
        <span className={styles.url}>
          <span className={styles.dot} />
          {previewSlug}.{PORTAL_BASE_DOMAIN}
        </span>
        <div className={styles.devices} role="group" aria-label="Tamaño de la vista previa">
          {(['desktop', 'mobile'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={device === value}
              onClick={() => setDevice(value)}
              className={cn(styles.device, device === value && styles['device--active'])}
            >
              {value === 'desktop' ? 'Escritorio' : 'Móvil'}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={frameRef}
        className={styles.frame}
        data-device={device}
        style={{ height }}
        aria-hidden="true"
      >
        <div
          ref={contentRef}
          className={styles.canvas}
          style={{ width, transform: `scale(${scale})` }}
          // Solo para mirar: sin foco ni clics dentro de la vista previa.
          {...{ inert: '' }}
        >
          {engine ? (
            <EnginePreview template={engine} source={engineSource} themeStyle={style} />
          ) : (
            <div
              className={templateStyles.page}
              data-template={template}
              data-pattern={typeof options.pattern === 'string' ? options.pattern : undefined}
              style={style}
            >
              <div className={styles.inner}>
                {template === 'editorial' ? (
                  <EditorialHero {...heroProps} />
                ) : template === 'carnet' ? (
                  <CarnetHero {...heroProps} />
                ) : template === 'impacto' ? (
                  <ImpactoHero {...heroProps} />
                ) : template === 'orbita' ? (
                  <OrbitaHero {...heroProps} />
                ) : template === 'historias' ? (
                  <HistoriasHero {...heroProps} coverVideoUrl={coverVideoUrl} />
                ) : (
                  <PortalProfileSection
                    profile={profile}
                    animalCount={total}
                    logoPosition={logoPosition}
                    actions={actions}
                  />
                )}

                <section className={styles.catalog}>
                  <h2 className={catalogStyles.heading}>Mascotas en adopción</h2>
                  {animals.length > 0 ? (
                    <div className={styles.grid}>
                      {animals.slice(0, 3).map((animal) => (
                        <AnimalCard key={animal.id} slug={previewSlug} animal={animal} />
                      ))}
                    </div>
                  ) : (
                    <div className={styles.grid}>
                      {[0, 1, 2].map((key) => (
                        <div key={key} className={cn(catalogStyles.card, styles.placeholder)} />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className={styles.note}>Vista previa con tus datos públicos y los cambios sin guardar.</p>
    </div>
  );
}

function EnginePreview({
  template,
  source,
  themeStyle,
}: {
  template: PortalTemplateId;
  source: TemplateSourceData;
  themeStyle: CSSProperties;
}) {
  const [design, setDesign] = useState<TemplateDesign | null>(null);

  useEffect(() => {
    let active = true;
    setDesign(null);
    if (!isEngineTemplate(template)) return;
    loadDesign(template)
      .then((loaded) => {
        if (active) setDesign(loaded);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [template]);

  if (!design) return null;
  return (
    <PortalTemplateView
      design={design}
      source={source}
      themeStyle={themeStyle}
      onReviewCreated={() => undefined}
    />
  );
}
