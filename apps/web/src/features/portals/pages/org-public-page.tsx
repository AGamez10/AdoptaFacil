import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type {
  AnimalSummary,
  Organization,
  PortalThemeConfig,
  PortalLogoPosition,
  PortalSocialNavPosition,
  PortalTemplateId,
  PortalTemplateOptions,
  PortalTheme,
  PortalView,
} from '@adoptafacil/contracts';
import { resolveTemplateOptions } from '@adoptafacil/contracts';
import { EmptyState, Skeleton } from '@adoptafacil/ui';
import { brandTokensToStyle } from '../../../shell/theme';
import { buildPortalView } from '../model/portal-view';
import {
  safeLogoPosition,
  safeMediaUrl,
  safePortalTheme,
  safeSocialNavPosition,
  safeTemplate,
} from '../model/theme';
import { fetchPublicAnimals } from '../api/public-animals';
import { fetchPublicOrganization } from '../api/public-organization';
import { PortalProfileSection } from '../components/portal-profile-section';
import {
  CarnetHero,
  EditorialHero,
  ImpactoHero,
  HistoriasHero,
  OrbitaHero,
} from '../components/templates/template-heroes';
import templateStyles from '../components/templates/portal-templates.module.scss';
import { PortalPlaceholderSection } from '../components/portal-placeholder-section';
import { PortalSocialLinks } from '../components/portal-social-links';
import { PortalAdoptionSection } from '../components/portal-adoption-section';
import { PortalProductsSection } from '../components/portal-products-section';
import { PortalNeedsSection } from '../components/portal-needs-section';
import { PortalCampaignsSection } from '../components/portal-campaigns-section';
import { PortalAboutSection } from '../components/portal-about-section';
import { PortalReviewsSection } from '../components/portal-reviews-section';
import { PortalContactInfoSection } from '../components/portal-contact-info-section';
import { PortalHeaderActions } from '../components/portal-header-actions';
import { PortalPublicLedgerSection } from '../components/portal-public-ledger-section';
import { PublicHeader, type PublicHeaderNavItem } from '../components/public-header';
import { PublicFooter } from '../components/public-footer';
import { PortalHelpCta } from '../components/portal-help-cta';
import { PortalAdoptionSteps } from '../components/portal-adoption-steps';
import { PortalMobileActionBar } from '../components/portal-mobile-action-bar';
import { buildDonateHref } from '../components/portal-donate-cta';
import { useFeature } from '../../../shell/capabilities';
import { useDocumentTitle } from '../../../lib/use-document-title';
import { useDonationAvailability } from '../../donations/hooks/use-donation-availability';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { ownerPreviewOrganization } from '../model/owner-preview';
import { PortalPreviewContext } from '../model/portal-preview-context';
import { TemplatePortal } from '../templates/template-portal';
import { isEngineTemplate } from '../templates/registry';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

interface Layout {
  logoPosition: PortalLogoPosition;
  socialNavPosition: PortalSocialNavPosition;
  /** Ola 3: plantilla visual del portal (mismo contenido, otra estructura). */
  template: PortalTemplateId;
  templateOptions: PortalTemplateOptions;
  /** Historias: video de portada opcional (URL pública ya resuelta). */
  coverVideoUrl?: string;
  /** Sin el sello "Hecho con AdoptaFácil" (plan con `portalRemoveSeal`). */
  hideSeal?: boolean;
}

const DEFAULT_LAYOUT: Layout = {
  logoPosition: 'left',
  socialNavPosition: 'right',
  template: 'clasica',
  templateOptions: {},
};

/**
 * PUBLIC organization PORTAL at `/o/:slug` (§M14). Rendered OUTSIDE the app shell
 * and WITHOUT authentication: it fetches the public projection directly (no token),
 * so it only ever shows public fields the backend chooses to expose (never
 * phone/legalName; NIT only once formalized).
 *
 * The portal is a rich, single-scroll page (rediseño T-D04 — reemplaza el
 * layout de tabs por anclas reales, confirmado con el dueño del producto,
 * `[Excepcion M14]`):
 *  - `PublicHeader` (nav sticky) + hero (`PortalProfileSection`, cover/logo,
 *    nombre, badges de tipo/formalización, stats reales) + `PublicFooter` —
 *    ambos NUEVOS, misma nav (anclas a las secciones reales de abajo).
 *  - the transparency indicator (§M14, T-027) only mounts when it has a REAL
 *    signal to show (verificationLevel > 0) — otherwise it stays unmounted rather
 *    than displaying an always-"No disponible" bar.
 *  - layout de dos columnas: columna principal con "Mascotas en adopción" /
 *    "Productos" / "Necesita hoy" (siempre visibles, ya no detrás de una tab),
 *    y UN panel lateral con "Campaña activa" + "Síguenos" juntos, del lado que
 *    indique `socialNavPosition` (S2-REORG, mismo campo real ya usado para el
 *    logo/sidebar). En mobile el panel lateral se apila debajo. Debajo del
 *    grid: banner "Cómo ayudar" (`PortalHelpCta`), y "Nosotros"/"Información"
 *    como secciones ancladas (antes tabs) que solo aparecen con contenido
 *    real. Todo con los MISMOS componentes/rutas/datos de siempre, solo
 *    reubicados — ver `docs/PLAN-CONTINUACION-SEBASTIAN_2026-09-23.md`.
 *  - aggregated sections still in `status: 'placeholder'` (transparencia — no
 *    owning module yet) are simply NOT mounted, instead of showing an empty
 *    "Próximamente" card; 'pets', 'products' (F-MKT-PORTAL-1), 'needsToday'
 *    (F-NEEDS-PORTAL-1) and 'activeCampaign' (F-CAMPANAS-PORTAL-2, S2-07) are
 *    all wired to real data (see docs/TASKS.md · deuda de cableado M14).
 *
 * PERSONALIZATION (T-027): the org's brand tokens are fetched and applied at
 * runtime as CSS custom properties on a SCOPED wrapper (not the global <html>), so
 * the portal re-brands without affecting anything else and without arbitrary CSS —
 * only the safe, validated token subset is ever applied.
 */
export interface OrgPublicPageProps {
  /**
   * Real-subdomain portal (F-1, M14): when the app resolves the current host
   * to an organization slug (`usePortalSubdomainSlug`), the shell renders this
   * page at `/` with the resolved slug instead of the `:slug` route param —
   * everything below behaves identically either way.
   */
  slugOverride?: string;
}

export function OrgPublicPage({ slugOverride }: OrgPublicPageProps = {}) {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const slug = slugOverride ?? slugParam;
  const [view, setView] = useState<PortalView | null>(null);
  const [theme, setTheme] = useState<PortalTheme>({});
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [state, setState] = useState<LoadState>('loading');
  const [animalTotal, setAnimalTotal] = useState<number | undefined>(undefined);
  const [animalSample, setAnimalSample] = useState<AnimalSummary[]>([]);
  // Ola 3: el portal público no existe (todavía) para este enlace. Si quien
  // mira es la propia organización, ve una vista previa privada.
  const [publicMissing, setPublicMissing] = useState(false);
  const [ownerPreview, setOwnerPreview] = useState(false);
  const client = useApiClient();
  const session = useSession();
  // Ola 1 (R1-1) / Ola 3 (R3-5): el portal solo muestra módulos encendidos.
  // Con un módulo apagado su sección ni se monta (antes pintaba "No se pudo
  // cargar" porque la API respondía 404) y no hay enlaces de dinero.
  const payments = useFeature('payments');
  const marketplace = useFeature('marketplace');
  const resources = useFeature('resources');
  const reputation = useFeature('reputation');
  // Si la org aún no recibe donaciones en línea (`canReceiveDonations: false`),
  // el "Donar" del hero se oculta y "Cómo ayudar" muestra un mensaje cálido con
  // otras formas de ayudar. Falla abierta: ante la duda, los botones siguen.
  const donationAvailability = useDonationAvailability(view?.profile.organization.id, payments);
  const donationsActive = donationAvailability !== 'unavailable';

  // "Adoptar"/"Apadrinar" (pulido visual) no inventan un flujo nuevo: solo
  // desplazan a la sección real "Mascotas en adopción" (rediseño T-D04, ya
  // sin tabs) donde el visitante elige el animal y sigue la ruta que ya
  // existe (ver `PortalHeaderActions`).
  const goToCatalog = () => {
    document
      .getElementById('portal-section-pets')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!slug) {
      setState('not-found');
      return;
    }
    let active = true;
    setPublicMissing(false);
    setOwnerPreview(false);
    const encoded = encodeURIComponent(slug);

    // The profile drives the page state (404/error). The theme (colors +
    // layout, S2-PORTAL) is best-effort: if it fails or is absent, the portal
    // simply renders the default design/layout.
    const profile = fetchPublicOrganization(slug).then((data) => {
      if (!data) throw new Error('not-found');
      return data;
    });

    const brand = fetch(`${API_BASE}/public/organizations/${encoded}/theme`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              tokens?: unknown;
              logoPosition?: unknown;
              socialNavPosition?: unknown;
              template?: unknown;
              templateOptions?: unknown;
              coverVideoUrl?: unknown;
              hideSeal?: unknown;
            }>)
          : null,
      )
      .then((body) => ({
        tokens: safePortalTheme(body?.tokens),
        layout: {
          logoPosition: safeLogoPosition(body?.logoPosition),
          socialNavPosition: safeSocialNavPosition(body?.socialNavPosition),
          template: safeTemplate(body?.template),
          // Saneo en el cliente: solo claves y valores de la lista cerrada.
          templateOptions: resolveTemplateOptions(
            safeTemplate(body?.template),
            body?.templateOptions,
          ),
          coverVideoUrl: safeMediaUrl(body?.coverVideoUrl),
          // La API ya cruzó la elección con el plan; ante la duda, sello.
          hideSeal: body?.hideSeal === true,
        },
      }))
      .catch(() => ({ tokens: {} as PortalTheme, layout: DEFAULT_LAYOUT }));

    profile
      .then(async (data) => {
        const brandResult = await brand;
        if (!active) return;
        setView(buildPortalView(data));
        setTheme(brandResult.tokens);
        setLayout(brandResult.layout);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof Error && err.message === 'not-found') {
          // Se decide abajo, cuando la sesión termine de cargar: dueño → vista
          // previa; cualquier otro → "no encontrada".
          setPublicMissing(true);
        } else {
          setState('error');
        }
      });
    return () => {
      active = false;
    };
  }, [slug]);

  // Ola 3: vista previa del DUEÑO. Una organización en borrador o sin aprobar
  // no tiene portal público, pero su equipo debe poder verlo antes de
  // publicarlo. Se lee con la sesión (su propio perfil y tema, bajo RLS) y
  // solo si el enlace es el de SU organización; el público sigue viendo
  // "Organización no encontrada".
  useEffect(() => {
    if (!publicMissing || !slug) return;
    if (session.status === 'loading') return;
    if (!session.isAuthenticated || session.user?.accountType !== 'organization') {
      setState('not-found');
      return;
    }
    let active = true;
    Promise.all([
      client.request<Organization>('/org/profile'),
      client.request<PortalThemeConfig>('/portals/theme').catch(() => null),
    ])
      .then(([org, themeConfig]) => {
        if (!active) return;
        const preview = ownerPreviewOrganization(org, slug);
        if (!preview) {
          setState('not-found');
          return;
        }
        const template = safeTemplate(themeConfig?.template);
        setView(buildPortalView(preview));
        setTheme(safePortalTheme(themeConfig?.tokens));
        setLayout({
          logoPosition: safeLogoPosition(themeConfig?.logoPosition),
          socialNavPosition: safeSocialNavPosition(themeConfig?.socialNavPosition),
          template,
          templateOptions: resolveTemplateOptions(template, themeConfig?.templateOptions),
          coverVideoUrl: safeMediaUrl(themeConfig?.coverVideoUrl),
          // La lectura propia trae la elección; se aplica solo si el plan la incluye.
          hideSeal: themeConfig?.hideSeal === true && themeConfig.removeSealAvailable !== false,
        });
        setOwnerPreview(true);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('not-found');
      });
    return () => {
      active = false;
    };
  }, [publicMissing, slug, session.status, session.isAuthenticated, session.user, client]);

  // Owner preview: the sections (animals, campaigns) read the organization's
  // own catalog through the authenticated preview endpoints, since the public
  // ones answer 404 until the organization is approved.
  const previewClient = ownerPreview ? client : null;

  // Real animal count for the profile stats row (pulido visual T-D02). A small,
  // INDEPENDENT fetch (Ola 3: limit 8, la muestra alimenta los héroes de las
  // plantillas; unfiltered) so it stays stable regardless of the
  // species filter the visitor picks inside PortalAdoptionSection — its own
  // internal fetch/filter logic is untouched.
  useEffect(() => {
    if (!slug) return;
    let active = true;
    fetchPublicAnimals({ slug, preview: previewClient, limit: 8, offset: 0 })
      .then((page) => {
        if (!active) return;
        setAnimalTotal(page.total);
        setAnimalSample(page.items);
      })
      .catch(() => {
        // Best-effort: the stat simply stays absent (never fabricated).
      });
    return () => {
      active = false;
    };
  }, [slug, previewClient]);

  // Only the safe token subset ever reaches inline styles (custom properties
  // cannot execute script; unknown keys were already filtered out).
  const themeStyle = useMemo(() => brandTokensToStyle(theme), [theme]);

  // Nivel de verificación SIEMPRE en 0 hasta que exista el catálogo (T-103) — la
  // barra de transparencia solo aporta información real cuando hay un nivel > 0
  // que mostrar (pulido visual T-D02, condición basada en el dato real, no un
  // "nunca más" hardcodeado: si el catálogo se puebla, la barra vuelve a aparecer).
  // Ola 3 (R3-5): la barra "Nivel · % formalización · Rendición" se retiró:
  // mezclaba documentos revisados por la plataforma con un estado de
  // formalización que hoy declara la propia organización (SEC-003). Los
  // documentos revisados se muestran como sellos en el hero.
  useDocumentTitle(view?.profile.organization.name);

  // Secciones agregadas AÚN sin módulo dueño (transparencia) nacen en
  // status:'placeholder' — ocultarlas evita el "Próximamente" vacío frente al
  // cliente (pulido visual T-D02). 'pets', 'products' (F-MKT-PORTAL-1),
  // 'needsToday' (F-NEEDS-PORTAL-1) y 'activeCampaign' (F-CAMPANAS-PORTAL-2,
  // S2-07) ya están cableadas a datos reales y siempre se muestran.
  const visibleSections = view?.sections.filter((section) => {
    if (section.kind === 'products') return marketplace;
    if (section.kind === 'needsToday') return resources;
    return (
      section.kind === 'pets' ||
      section.kind === 'activeCampaign' ||
      section.status !== 'placeholder'
    );
  });
  // "Campaña activa" se movió a la franja superior (junto a "Síguenos", pulido
  // visual); 'pets' se queda en la tab "Portafolio"; cualquier otra sección
  // que algún día deje de ser placeholder cae dentro de la tab, como antes.
  const hasActiveCampaignSection = visibleSections?.some(
    (section) => section.kind === 'activeCampaign',
  );
  const portafolioSections = visibleSections?.filter(
    (section) => section.kind !== 'activeCampaign',
  );

  // Anclas reales de la nav (header/footer, rediseño T-D04) — solo entran las
  // que de verdad tienen destino: "Nosotros"/"Contacto" únicamente con
  // contenido real, nunca un link muerto.
  const aboutUs = view?.profile.organization.aboutUs?.trim();
  const contact = view?.profile.organization.extendedContact;
  const hasContactInfo = Boolean(
    contact &&
    (contact.hours ||
      contact.fullAddress ||
      contact.mapUrl ||
      (contact.additionalPhones && contact.additionalPhones.length > 0)),
  );
  const navItems: PublicHeaderNavItem[] = [
    { label: 'Inicio', href: '#portal-top' },
    { label: 'Animales', href: '#portal-section-pets' },
    { label: payments ? 'Cómo ayudar' : 'Cómo adoptar', href: '#portal-help-cta' },
    ...(aboutUs ? [{ label: 'Nosotros', href: '#portal-about' }] : []),
    ...(reputation ? [{ label: 'Reseñas', href: '#portal-reviews' }] : []),
    // RF14: el libro público se ve siempre (la transparencia es un pilar).
    { label: 'Transparencia', href: '#portal-section-public-ledger' },
    ...(hasContactInfo ? [{ label: 'Contacto', href: '#portal-contact-info' }] : []),
  ];

  // Las plantillas (Ola 3) reciben los MISMOS datos que la Clásica.
  const heroProps = view
    ? {
        profile: view.profile,
        slug: slug as string,
        animalCount: animalTotal,
        animals: animalSample,
        options: layout.templateOptions,
        actions: (
          <PortalHeaderActions
            organization={view.profile.organization}
            onBrowseCatalog={goToCatalog}
            donationsActive={donationsActive}
          />
        ),
      }
    : null;

  const classic = (
    <PortalPreviewContext.Provider value={previewClient}>
      <div
        className={templateStyles.page}
        data-template={state === 'ready' ? layout.template : undefined}
        data-pattern={
          typeof layout.templateOptions.pattern === 'string'
            ? layout.templateOptions.pattern
            : undefined
        }
        data-testid="portal-page"
      >
        {state === 'ready' && view && (
          <PublicHeader organization={view.profile.organization} navItems={navItems} />
        )}
        <main
          id="portal-top"
          className="mx-auto w-full px-4 py-10 sm:px-6 lg:w-[94vw] lg:max-w-[1500px] lg:px-0"
          style={{ ...themeStyle, scrollMarginTop: '5rem' }}
        >
          {state === 'loading' && <Skeleton className="h-72 w-full" />}
          {state === 'not-found' && (
            <EmptyState
              title="Organización no encontrada"
              description="El enlace no corresponde a ninguna organización."
            />
          )}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && view && heroProps && (
            <div className="space-y-8">
              {ownerPreview && (
                <div
                  role="status"
                  data-testid="portal-owner-preview"
                  className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950"
                >
                  <strong>Vista previa privada.</strong> Solo tu equipo ve esta página. Tu portal
                  será público cuando la plataforma apruebe tu organización; mientras tanto puedes
                  ajustarlo en{' '}
                  <a className="font-semibold underline" href="/organizacion/portal">
                    Diseña tu portal
                  </a>
                  .
                </div>
              )}
              {/* Header (3ra iteración): perfil + KPI(s) + acciones viven TODOS
                dentro del mismo panel (`PortalProfileSection`) — ya no hay una
                tarjeta de KPI flotante aparte ni una fila extra a su lado. */}
              {layout.template === 'editorial' ? (
                <EditorialHero {...heroProps} />
              ) : layout.template === 'carnet' ? (
                <CarnetHero {...heroProps} />
              ) : layout.template === 'impacto' ? (
                <ImpactoHero {...heroProps} />
              ) : layout.template === 'orbita' ? (
                <OrbitaHero {...heroProps} />
              ) : layout.template === 'historias' ? (
                <HistoriasHero
                  {...heroProps}
                  coverVideoUrl={layout.coverVideoUrl}
                  onBrowseCatalog={goToCatalog}
                />
              ) : (
                <PortalProfileSection
                  profile={view.profile}
                  animalCount={animalTotal}
                  logoPosition={layout.logoPosition}
                  actions={heroProps.actions}
                />
              )}

              {/* Dos columnas (pulido visual, 2da iteración): columna principal
                con "Mascotas en adopción"/"Productos"/"Necesita hoy" SIEMPRE
                visibles (rediseño T-D04, ya no detrás de una tab), y UN panel
                lateral con "Campaña activa" + "Síguenos" juntos. El lado lo
                decide `socialNavPosition`, el mismo campo REAL ya usado
                arriba para la posición del logo/sidebar (S2-REORG,
                `PortalThemeConfig.socialNavPosition` —
                `packages/contracts/src/portals.ts`) — no uno nuevo. En mobile
                el panel lateral se apila debajo (grid de 1 columna). */}
              <div
                className="portal-reveal grid gap-8 lg:grid-cols-[1fr_320px]"
                data-testid="portal-main-grid"
              >
                <div
                  className={`space-y-6 ${layout.socialNavPosition === 'left' ? 'lg:order-last' : ''}`}
                >
                  {/* "Mascotas en adopción" (kind 'pets', §M03/T-052),
                    "Productos" (kind 'products', §M10, F-MKT-PORTAL-1) y
                    "Necesita hoy" (kind 'needsToday', §M09,
                    F-NEEDS-PORTAL-1); cualquier otra sección que algún día
                    deje de ser placeholder aparecería aquí también. */}
                  {portafolioSections?.map((section) =>
                    section.kind === 'pets' ? (
                      <PortalAdoptionSection
                        key={section.kind}
                        slug={slug as string}
                        organization={view.profile.organization}
                      />
                    ) : section.kind === 'products' ? (
                      <PortalProductsSection
                        key={section.kind}
                        organizationId={view.profile.organization.id}
                      />
                    ) : section.kind === 'needsToday' ? (
                      <PortalNeedsSection
                        key={section.kind}
                        organizationId={view.profile.organization.id}
                      />
                    ) : (
                      <PortalPlaceholderSection key={section.kind} section={section} />
                    ),
                  )}
                </div>

                <aside
                  className={`space-y-6 ${layout.socialNavPosition === 'left' ? 'lg:order-first' : ''}`}
                  data-testid="portal-side-panel"
                >
                  {hasActiveCampaignSection && (
                    <PortalCampaignsSection key="activeCampaign" slug={slug as string} />
                  )}
                  <PortalSocialLinks organization={view.profile.organization} />
                </aside>
              </div>

              {payments ? (
                <PortalHelpCta
                  organization={view.profile.organization}
                  donationsActive={donationsActive}
                  onBrowseAnimals={goToCatalog}
                />
              ) : (
                <PortalAdoptionSteps
                  organization={view.profile.organization}
                  onBrowseCatalog={goToCatalog}
                />
              )}

              {/* "Nosotros"/"Información" (S2-PORTAL, rediseño T-D04): antes
                tabs, ahora secciones ancladas siempre visibles cuando hay
                contenido real — nunca una sección vacía. */}
              {aboutUs && (
                <section id="portal-about" style={{ scrollMarginTop: '5rem' }}>
                  <PortalAboutSection aboutUs={aboutUs} />
                </section>
              )}
              {reputation && <PortalReviewsSection slug={slug as string} />}

              {hasContactInfo && contact && (
                <section id="portal-contact-info" style={{ scrollMarginTop: '5rem' }}>
                  <PortalContactInfoSection
                    contact={contact}
                    location={view.profile.organization.location}
                  />
                </section>
              )}

              <PortalPublicLedgerSection slug={slug as string} />
            </div>
          )}
        </main>
        {state === 'ready' && view && (
          <div className="mx-auto w-full px-4 sm:px-6 lg:w-[94vw] lg:max-w-[1500px] lg:px-0">
            <PublicFooter
              organization={view.profile.organization}
              navItems={navItems}
              showSeal={!layout.hideSeal}
            />
          </div>
        )}
        {state === 'ready' && view && (
          <PortalMobileActionBar
            onAdopt={goToCatalog}
            donateHref={
              payments && donationsActive ? buildDonateHref(view.profile.organization) : undefined
            }
          />
        )}
      </div>
    </PortalPreviewContext.Provider>
  );
  // Plantillas del motor (14 gratuitas nuevas): pintan el mismo contenido con su
  // propio diseño. Si la plantilla no carga o los datos fallan, se muestra el
  // portal clásico de arriba: nunca queda un portal caído por el diseño elegido.
  if (state === 'ready' && view && slug && isEngineTemplate(layout.template)) {
    return (
      <TemplatePortal
        template={layout.template}
        slug={slug}
        organization={view.profile.organization}
        themeStyle={themeStyle}
        fallback={classic}
      />
    );
  }
  return classic;
}
