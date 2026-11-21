import { Link } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import { STATIC_PAGES } from '../../../seo/page-meta.js';
import { useSeo } from '../../../seo/seo';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { IconArrowRight } from '../components/landing-icons';
import {
  ForOrganizationsSection,
  LANDING_ORGS_ID,
  ORGANIZATIONS_PATH,
  PromisesSection,
} from '../components/landing-sections';
import { LANDING_TEMPLATES_ID, TemplateGallerySection } from '../components/landing-showcase';
import landing from '../components/landing.module.scss';
import { SectionNav } from '../components/section-nav';
import { useScrollToHash } from '../model/use-scroll-to-hash';
import { PageIntro } from './page-intro';

const SECTIONS = [
  { id: LANDING_ORGS_ID, label: 'Qué incluye' },
  { id: 'planes', label: 'Planes' },
  { id: LANDING_TEMPLATES_ID, label: 'Plantillas' },
  { id: 'confianza', label: 'Lo que cuidamos' },
];

/**
 * `/para-organizaciones`: todo lo que un refugio, fundación o rescatista
 * necesita para decidirse (propuesta, planes con los precios del catálogo
 * único, plantillas y lo que cuidamos). Antes vivía al final de la landing;
 * ahora la portada solo lleva un resumen con enlace aquí.
 */
export function OrganizationsPage() {
  const meta = STATIC_PAGES[ORGANIZATIONS_PATH];
  useSeo({ title: meta.title, description: meta.description, path: ORGANIZATIONS_PATH });
  useScrollToHash();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-foreground">
      <PublicNavbar />
      <main className="flex-1" data-testid="organizations-page">
        <PageIntro
          eyebrow="Para refugios, fundaciones y rescatistas"
          title="Tu organización, en orden y a la vista de quienes quieren ayudar."
          actions={
            <>
              <Link to="/register" className={cn(landing.btn, landing['btn--primary'])}>
                Crear mi portal gratis
                <IconArrowRight className={landing.btn__icon} />
              </Link>
              <Link to="/login" className={cn(landing.btn, landing['btn--ghost'])}>
                Ya tengo cuenta
              </Link>
            </>
          }
        >
          Empiezas gratis y sin tarjeta. Tu portal, tus animales con expediente y tus adopciones con
          contrato; nosotros te ayudamos a que más personas te conozcan.
        </PageIntro>
        <SectionNav label="Secciones de la página para organizaciones" items={SECTIONS} />
        <ForOrganizationsSection />
        <TemplateGallerySection />
        <PromisesSection />
      </main>
      <PublicFooter />
    </div>
  );
}
