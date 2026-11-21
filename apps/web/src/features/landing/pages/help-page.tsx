import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import { STATIC_PAGES } from '../../../seo/page-meta.js';
import { useSeo } from '../../../seo/seo';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { ActiveCampaignsSection, HELP_PATH } from '../components/commerce-sections';
import { CommunityWallSection, LANDING_SOCIAL_ID } from '../components/community-wall-section';
import { IconArrowRight } from '../components/landing-icons';
import { CommunitySection } from '../components/landing-sections';
import landing from '../components/landing.module.scss';
import { SectionNav } from '../components/section-nav';
import { useCatalogSnapshot } from '../model/use-catalog-snapshot';
import { useScrollToHash } from '../model/use-scroll-to-hash';
import { PageIntro } from './page-intro';

const loadNetwork = () => import('../components/network-sections');
const NetworkNeedsSection = lazy(() =>
  loadNetwork().then((m) => ({ default: m.NetworkNeedsSection })),
);
const PublicLedgerSection = lazy(() =>
  loadNetwork().then((m) => ({ default: m.PublicLedgerSection })),
);
const GuidesSection = lazy(() => loadNetwork().then((m) => ({ default: m.GuidesSection })));

const SECTIONS = [
  { id: 'campanas', label: 'Campañas' },
  { id: 'necesidades', label: 'Lo que piden' },
  { id: LANDING_SOCIAL_ID, label: 'Comunidad' },
  { id: 'transparencia', label: 'Transparencia' },
  { id: 'servicios', label: 'Servicios' },
  { id: 'guias', label: 'Guías' },
];

/**
 * `/ayudar`: lo que la red necesita HOY, con datos reales (campañas,
 * insumos, voluntariados, el muro de la comunidad y los libros públicos).
 * Antes ocupaba media landing; ahora la portada enlaza aquí desde "Formas de
 * ayudar" y la página tiene su propio índice.
 */
export function HelpPage() {
  const meta = STATIC_PAGES[HELP_PATH];
  useSeo({ title: meta.title, description: meta.description, path: HELP_PATH });
  useScrollToHash();
  const snapshot = useCatalogSnapshot();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-foreground">
      <PublicNavbar />
      <main className="flex-1" data-testid="help-page">
        <PageIntro
          eyebrow="Formas de ayudar"
          title="Lo que la red de rescate necesita hoy."
          actions={
            <>
              <Link to="/campanas" className={cn(landing.btn, landing['btn--primary'])}>
                Apoyar una campaña
                <IconArrowRight className={landing.btn__icon} />
              </Link>
              <Link to="/adoptar" className={cn(landing.btn, landing['btn--ghost'])}>
                Prefiero adoptar
              </Link>
            </>
          }
        >
          Campañas con meta y evidencia, insumos que piden los refugios, jornadas de voluntariado y
          las cuentas abiertas de cada organización. Elige cómo sumar.
        </PageIntro>
        <SectionNav label="Secciones de la página para ayudar" items={SECTIONS} />
        <ActiveCampaignsSection />
        <Suspense fallback={null}>
          <NetworkNeedsSection />
        </Suspense>
        <CommunityWallSection />
        <Suspense fallback={null}>
          <PublicLedgerSection snapshot={snapshot} />
        </Suspense>
        <CommunitySection />
        <Suspense fallback={null}>
          <GuidesSection />
        </Suspense>
      </main>
      <PublicFooter />
    </div>
  );
}
