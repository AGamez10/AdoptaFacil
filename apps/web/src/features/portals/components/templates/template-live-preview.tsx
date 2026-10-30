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
import { BASE_CSS } from '../../templates/engine/base-css';
import { createKit } from '../../templates/engine/kit';
import { buildTemplateModel } from '../../templates/engine/model';
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
  // En pantallas pequeñas se abre la vista de celular (el editor usa el ancho del dispositivo).
  const [device, setDevice] = useState<Device>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'mobile' : 'desktop',
  );
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
            <EnginePreview
              template={engine}
              source={engineSource}
              themeStyle={style}
              width={width}
              device={device}
            />
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

/**
 * Sin scripts, las entradas animadas (que activa el JS del portal) se quedarían
 * ocultas: aquí se muestran en su estado final y se quitan las transiciones.
 */
const PREVIEW_STATIC_CSS = `.af-tpl *,.af-tpl *::before,.af-tpl *::after{transition:none!important;animation:none!important}
.af-tpl .is-pre,.af-tpl .k-name span,.af-tpl .k-fr span,.af-tpl .k-slide{opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important}
/* Marcos que empiezan recortados (arco de revista, foto de portada) y se abren por JS. */
.af-tpl .r-arch,.af-tpl .r-fig .ph{clip-path:none!important}`;

/**
 * Documento de la vista previa: la MISMA plantilla (su CSS y su marcado real) dentro
 * de un iframe del ancho real del dispositivo. Así los media queries y las unidades de
 * viewport se comportan como en el portal, no según la ventana del editor. Sin scripts.
 */
function buildPreviewDoc(
  design: TemplateDesign,
  source: TemplateSourceData,
  themeStyle: CSSProperties,
): string {
  const model = buildTemplateModel(source);
  const body = design.html(model, createKit(model));
  const vars = Object.entries(themeStyle as Record<string, string>)
    .map(([key, value]) => `${key}:${String(value).replace(/["<>]/g, '')}`)
    .join(';');
  const fonts = design.fonts
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${design.fonts}&display=swap">`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${fonts}<style>html,body{margin:0}${BASE_CSS}${design.css}${PREVIEW_STATIC_CSS}</style></head><body><div class="af-tpl tpl-${design.id}${design.kit ? ' kit' : ''}" style="${vars}">${body}</div></body></html>`;
}

/**
 * Plantillas cuya animación depende de JS o WebGL: en la vista previa (sin scripts)
 * se quedarían en blanco. Se muestra una captura real del portal con sus scripts,
 * generada por plantilla (public/template-previews). Son datos de demostración.
 */
const REFERENCE_PREVIEWS = new Set<PortalTemplateId>([
  'solar',
  'galeria',
  'cine',
  'aurora',
  'constelacion',
  'match',
  'estudio',
  'portada',
  'hilo',
]);

function EnginePreview({
  template,
  source,
  themeStyle,
  width,
  device,
}: {
  template: PortalTemplateId;
  source: TemplateSourceData;
  themeStyle: CSSProperties;
  width: number;
  device: Device;
}) {
  const [design, setDesign] = useState<TemplateDesign | null>(null);
  // Alto de pantalla del dispositivo: las medidas en vh de las plantillas dependen de él.
  const height = device === 'mobile' ? 844 : 900;

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

  const srcDoc = useMemo(
    () => (design ? buildPreviewDoc(design, source, themeStyle) : ''),
    [design, source, themeStyle],
  );
  if (REFERENCE_PREVIEWS.has(template)) {
    return (
      <img
        src={`/template-previews/${template}-${device === 'mobile' ? '390' : '1440'}.jpg`}
        alt={`Vista previa de la plantilla ${template}`}
        width={width}
        decoding="async"
        style={{ width, height: 'auto', display: 'block' }}
      />
    );
  }
  if (!design) return null;
  return (
    <iframe
      title={`Vista previa de la plantilla ${design.id}`}
      srcDoc={srcDoc}
      // Sin scripts ni navegación: solo se mira. allow-same-origin deja medir la altura.
      sandbox="allow-same-origin"
      style={{ width, height, border: 0, display: 'block' }}
    />
  );
}
