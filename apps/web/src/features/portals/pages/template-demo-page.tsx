import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Role, type AnimalSummary, type PortalTemplateId } from '@adoptafacil/contracts';
import { buttonVariants, cn, Skeleton } from '@adoptafacil/ui';
import { useSeo } from '../../../seo/seo';
import { useSession } from '../../../shell/auth';
import { buildPortalView } from '../model/portal-view';
import { PortalAdoptionSection } from '../components/portal-adoption-section';
import { PortalAboutSection } from '../components/portal-about-section';
import { PortalContactInfoSection } from '../components/portal-contact-info-section';
import { PortalProfileSection } from '../components/portal-profile-section';
import { PortalSocialLinks } from '../components/portal-social-links';
import { PublicFooter } from '../components/public-footer';
import { PublicHeader } from '../components/public-header';
import templateStyles from '../components/templates/portal-templates.module.scss';
import { buildDemoSource } from '../templates/demo/demo-portal';
import { PreviewAnimalDialog } from '../templates/demo/preview-animal-dialog';
import { useOwnPortalSource } from '../templates/demo/use-own-portal-source';
import {
  DEMO_TEMPLATE_IDS,
  isDemoTemplate,
  registerWithTemplateHref,
  templateDemoHref,
  templateName,
} from '../templates/demo/demo-templates';
import type { TemplateDesign } from '../templates/engine/types';
import type { TemplateSourceData } from '../templates/engine/model';
import { PortalTemplateView } from '../templates/portal-template-view';
import { isEngineTemplate, loadDesign, type EngineTemplateId } from '../templates/registry';

/**
 * Vista previa PÚBLICA de una plantilla (`/plantillas/:id`): el portal completo
 * pintado con datos de demostración (`demo-portal.ts`) para que quien la elige
 * la vea llena. Para un visitante no consulta la API, no se indexa (noindex) y
 * ningún enlace del portal de ejemplo sale de la página. Desde aquí se va al
 * registro con la plantilla elegida (`/register?plantilla=<id>`).
 *
 * Quien gestiona una organización que ya registró animales ve la plantilla con
 * SUS datos (`useOwnPortalSource`); los de ejemplo solo aparecen mientras no
 * tenga ninguno.
 *
 * `?captura=1` oculta la barra superior: así se generan las miniaturas de
 * `public/template-previews`.
 */
export function TemplateDemoPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const capture = params.get('captura') === '1';
  const template = isDemoTemplate(id) ? id : null;
  const { status, hasAnyRole } = useSession();
  const isOrgEditor = status === 'authenticated' && hasAnyRole(Role.Owner, Role.Administrator);
  const own = useOwnPortalSource(isOrgEditor && !capture);
  const demoSource = useMemo(() => buildDemoSource(), []);
  const source = own.status === 'ready' ? own.data : demoSource;
  const name = template ? templateName(template) : '';

  useSeo({
    title: template ? `Plantilla ${name} (ejemplo)` : undefined,
    description: `Así se ve un portal de AdoptaFácil con la plantilla ${name}, lleno con datos de ejemplo.`,
    noindex: true,
  });

  if (!template) return <Navigate to="/#plantillas" replace />;

  return (
    <div className="min-h-screen bg-background" data-testid="template-demo-page">
      {!capture && <DemoBar template={template} ownData={own.status === 'ready'} />}
      {own.status === 'loading' ? (
        <div className="mx-auto w-full max-w-[1320px] px-4 py-10" aria-busy="true">
          <Skeleton className="h-72 w-full" />
        </div>
      ) : isEngineTemplate(template) ? (
        <EngineDemo template={template} source={source} />
      ) : (
        <ClassicDemo source={source} />
      )}
    </div>
  );
}

function DemoBar({ template, ownData }: { template: PortalTemplateId; ownData: boolean }) {
  const { status, hasAnyRole } = useSession();
  const index = DEMO_TEMPLATE_IDS.indexOf(template);
  const prev = DEMO_TEMPLATE_IDS[(index - 1 + DEMO_TEMPLATE_IDS.length) % DEMO_TEMPLATE_IDS.length];
  const next = DEMO_TEMPLATE_IDS[(index + 1) % DEMO_TEMPLATE_IDS.length];
  const name = templateName(template);
  // Quien ya tiene organización no se registra otra vez: prueba la plantilla en
  // su editor, sin guardar nada hasta que lo decida.
  const signedIn = status === 'authenticated';
  const isOrg = signedIn && hasAnyRole(Role.Owner, Role.Administrator);
  const cta = isOrg
    ? { to: `/organizacion/portal?plantilla=${template}`, label: 'Probar en mi portal' }
    : signedIn
      ? null
      : {
          to: registerWithTemplateHref(template),
          label: 'Usar esta plantilla y registrar mi fundación',
        };

  const arrow = cn(
    buttonVariants({ variant: 'outline', size: 'sm' }),
    'h-9 w-9 shrink-0 p-0 text-base',
  );
  return (
    <div
      role="region"
      aria-label="Vista de ejemplo de la plantilla"
      className="sticky top-0 z-[60] border-b border-border bg-background/95 shadow-sm backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link
          to="/#plantillas"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Plantillas
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            to={templateDemoHref(prev)}
            className={arrow}
            aria-label={`Ver plantilla ${templateName(prev)}`}
          >
            ‹
          </Link>
          <div className="min-w-0 text-center sm:text-left">
            <p className="truncate text-sm font-bold text-foreground">Plantilla {name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {ownData
                ? 'Con los datos de tu organización. Los botones del portal no llevan a ninguna parte.'
                : isOrg
                  ? 'Datos de ejemplo: cuando registres tu primer animal verás aquí los tuyos.'
                  : 'Ejemplo con datos de prueba. Los botones del portal no llevan a ninguna parte.'}
            </p>
          </div>
          <Link
            to={templateDemoHref(next)}
            className={arrow}
            aria-label={`Ver plantilla ${templateName(next)}`}
          >
            ›
          </Link>
        </div>
        {cta && (
          <Link
            to={cta.to}
            className={cn(buttonVariants({ size: 'sm' }), 'w-full sm:w-auto')}
            data-testid="template-demo-cta"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}

function EngineDemo({
  template,
  source,
}: {
  template: EngineTemplateId;
  source: TemplateSourceData;
}) {
  const [design, setDesign] = useState<TemplateDesign | null | 'failed'>(null);
  useEffect(() => {
    let active = true;
    setDesign(null);
    loadDesign(template)
      .then((loaded) => {
        if (active) setDesign(loaded);
      })
      .catch(() => {
        if (active) setDesign('failed');
      });
    return () => {
      active = false;
    };
  }, [template]);

  if (design === 'failed') return <ClassicDemo source={source} />;
  if (!design) {
    return (
      <div className="mx-auto w-full max-w-[1320px] px-4 py-10" aria-busy="true">
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  return <PortalTemplateView design={design} source={source} themeStyle={{}} demo />;
}

const CLASSIC_NAV = [
  { label: 'Inicio', href: '#portal-top' },
  { label: 'Animales', href: '#portal-section-pets' },
  { label: 'Nosotros', href: '#portal-about' },
  { label: 'Contacto', href: '#portal-contact-info' },
] as const;

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/**
 * La Clásica de ejemplo con los mismos componentes del portal clásico. Las
 * secciones que en el portal real consultan la API (campañas, reseñas, libro)
 * se pintan aquí con los datos de ejemplo, sin llamar a nada.
 */
function ClassicDemo({ source }: { source: TemplateSourceData }) {
  const organization = source.organization;
  const [openAnimal, setOpenAnimal] = useState<AnimalSummary | null>(null);
  const profile = useMemo(() => buildPortalView(organization).profile, [organization]);
  // Ningún enlace interno sale del ejemplo; las anclas del menú siguen funcionando.
  const stayHere = (event: MouseEvent) => {
    const a = (event.target as Element).closest('a');
    if (a && !(a.getAttribute('href') ?? '').startsWith('#')) event.preventDefault();
  };
  return (
    <div className={templateStyles.page} data-template="clasica" onClickCapture={stayHere}>
      <PublicHeader organization={organization} navItems={CLASSIC_NAV} />
      <main
        id="portal-top"
        className="mx-auto w-full space-y-8 px-4 py-10 sm:px-6 lg:w-[94vw] lg:max-w-[1500px] lg:px-0"
        style={{ scrollMarginTop: '5rem' }}
      >
        <PortalProfileSection
          profile={profile}
          animalCount={source.animalTotal}
          actions={
            <a href="#portal-section-pets" className={buttonVariants({ size: 'lg' })}>
              Conocer a nuestros animales
            </a>
          }
        />
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div style={{ scrollMarginTop: '5rem' }}>
            {/* El MISMO catálogo del portal (filtros, orden, "Cargar más" de a 12
                hasta el último), sobre los animales de la vista previa. */}
            <PortalAdoptionSection
              slug={source.slug}
              animals={source.animals}
              onOpenDetail={setOpenAnimal}
            />
          </div>
          <aside className="space-y-6">
            {source.campaigns.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="text-lg font-bold text-foreground">Campañas activas</h2>
                <ul className="mt-3 space-y-4">
                  {source.campaigns.map((c) => (
                    <li key={c.id}>
                      <p className="text-sm font-semibold text-foreground">{c.title}</p>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round(c.progress * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {COP.format(c.raisedAmount)} de {COP.format(c.goalAmount)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <PortalSocialLinks organization={organization} />
          </aside>
        </div>
        {organization.aboutUs && (
          <section id="portal-about" style={{ scrollMarginTop: '5rem' }}>
            <PortalAboutSection aboutUs={organization.aboutUs} />
          </section>
        )}
        {organization.extendedContact && (
          <section id="portal-contact-info" style={{ scrollMarginTop: '5rem' }}>
            <PortalContactInfoSection
              contact={organization.extendedContact}
              location={organization.location}
            />
          </section>
        )}
      </main>
      <div className="mx-auto w-full px-4 sm:px-6 lg:w-[94vw] lg:max-w-[1500px] lg:px-0">
        <PublicFooter organization={organization} navItems={CLASSIC_NAV} />
      </div>
      <PreviewAnimalDialog
        animal={openAnimal}
        animals={source.animals}
        org={organization}
        slug={source.slug}
        onOpenAnimal={setOpenAnimal}
      />
    </div>
  );
}
