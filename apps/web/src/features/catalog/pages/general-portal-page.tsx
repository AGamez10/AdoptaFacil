import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { PublicHeroBanner } from '@adoptafacil/contracts';
import { useSession } from '../../../shell/auth';
import { FullPageLoading, PublicFooter, PublicNavbar } from '../../../shell/layout';
import { HOME_FAQ, STATIC_PAGES } from '../../../seo/page-meta.js';
import { faqLd, organizationLd, useSeo, websiteLd } from '../../../seo/seo';
import {
  AdoptionStepsSection,
  CoffeeSection,
  CoffeeTeaser,
  FaqSection,
  FinalCtaSection,
  ImpactSection,
  LANDING_CATALOG_ID,
  LANDING_COFFEE_ID,
  LANDING_FAQ_ID,
  LANDING_HELP_ID,
  LANDING_ORGS_ID,
  LANDING_STEPS_ID,
  LANDING_WAITING_ID,
  LandingHero,
  OrganizationsTeaserSection,
  SectionNav,
  WaitingAnimalsSection,
  WaysToHelpSection,
  useCatalogSnapshot,
  useScrollToHash,
} from '../../landing';
import { buildAdoptPath } from '../model/adopt-filters';

/** Índice de la landing: siete paradas, en el orden del embudo. */
const LANDING_SECTIONS = [
  { id: LANDING_WAITING_ID, label: 'Te esperan' },
  { id: LANDING_STEPS_ID, label: 'Cómo adoptar' },
  { id: 'red', label: 'Rescatistas' },
  { id: LANDING_HELP_ID, label: 'Ayudar' },
  { id: LANDING_COFFEE_ID, label: 'Café' },
  { id: LANDING_ORGS_ID, label: 'Organizaciones' },
  { id: LANDING_FAQ_ID, label: 'Preguntas' },
];

/** Anclas que salieron de la landing: los enlaces viejos llegan a su página. */
const MOVED_ANCHORS: Record<string, string> = {
  '#campanas': '/ayudar#campanas',
  '#necesidades': '/ayudar#necesidades',
  '#comunidad': '/ayudar#comunidad',
  '#transparencia': '/ayudar#transparencia',
  '#guias': '/ayudar#guias',
  '#plantillas': '/para-organizaciones#plantillas',
  '#planes': '/para-organizaciones#planes',
};

const LEGACY_SPECIES: Record<string, 'dog' | 'cat'> = { perros: 'dog', gatos: 'cat' };

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** `GET /public/hero-banner` (S-15, sin sesión) — best-effort: si falla o
 *  trae un cuerpo inesperado, el collage decorativo de siempre se queda tal
 *  cual (nunca una caja rota por un fetch fallido). */
function useHeroBannerPhotos(): string[] {
  const [photos, setPhotos] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/public/hero-banner`)
      .then((response) => (response.ok ? (response.json() as Promise<PublicHeroBanner>) : null))
      .then((body) => {
        if (active && Array.isArray(body?.photos)) setPhotos(body.photos);
      })
      .catch(() => {
        // Best-effort: el collage decorativo se queda como fallback.
      });
    return () => {
      active = false;
    };
  }, []);
  return photos;
}

/**
 * Portal GENERAL de entrada de AdoptaFácil (F-LANDING-01, M14, RF25, documento
 * base §8, objetivo #7 "bajar barreras de entrada"). ES la nueva "/" pública:
 * catálogo consolidado de animales de TODAS las organizaciones, acceso a cada
 * organización y al login/registro — nunca el login directo.
 *
 * DISTINTO del portal INDIVIDUAL `/o/:slug` de cada organización (dominio que
 * Sebastián pule ahora con tabs/posiciones) — este archivo no lo toca; solo
 * enlaza a él desde cada tarjeta de animal.
 *
 * Un usuario CON sesión que llega aquí es enviado a su shell autenticado
 * (`/inicio`, antes el índice protegido) — el mismo mecanismo de sesión que
 * usa el resto del shell (`useSession().status`), no un chequeo ad-hoc.
 */
export function GeneralPortalPage() {
  const { status } = useSession();
  const { hash, search } = useLocation();
  const heroBannerPhotos = useHeroBannerPhotos();
  const snapshot = useCatalogSnapshot();
  useSeo({
    title: STATIC_PAGES['/'].title,
    description: STATIC_PAGES['/'].description,
    path: '/',
    jsonLd: [organizationLd(), websiteLd(), faqLd(HOME_FAQ)],
  });
  useScrollToHash();

  if (status === 'loading') {
    return <FullPageLoading label="Verificando tu sesión…" />;
  }

  if (status === 'authenticated') {
    return <Navigate to="/inicio" replace />;
  }

  const moved = MOVED_ANCHORS[hash];
  if (moved) return <Navigate to={moved} replace />;

  // El catálogo completo vive ahora en /adoptar; los enlaces viejos
  // (`/#adoptar`, `/?especie=gatos&ciudad=Medellín#adoptar`) siguen sirviendo.
  const legacy = new URLSearchParams(search);
  if (hash === `#${LANDING_CATALOG_ID}` || legacy.has('especie') || legacy.has('ciudad')) {
    const species = LEGACY_SPECIES[legacy.get('especie') ?? ''] ?? 'all';
    return <Navigate to={buildAdoptPath(species, legacy.get('ciudad'))} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-foreground">
      <PublicNavbar />

      <main className="flex-1">
        {/* Landing corta (2026-11): solo lo que convierte, en orden de embudo,
            con un índice fijo para saltar entre secciones. Lo demás vive en
            su propia página: /ayudar (campañas, insumos, voluntariado,
            comunidad, libros públicos, servicios y guías) y
            /para-organizaciones (propuesta, planes, plantillas y confianza).
            1. Engancha: hero con los tres caminos; el aviso del café aparece
               y se va solo.
            2. Enamora: animales reales y lo fácil que es adoptar.
            3. Prueba: la red de rescatistas con cifras reales.
            4. Actúa: formas de ayudar y el café.
            5. Organizaciones: resumen con enlace a su página.
            6. Resuelve: preguntas y el cierre.
            Ninguna cifra que no salga de la API. */}
        <LandingHero snapshot={snapshot} />
        <SectionNav label="Secciones de la página de inicio" items={LANDING_SECTIONS} />
        <WaitingAnimalsSection snapshot={snapshot} />
        <AdoptionStepsSection photos={heroBannerPhotos} />
        <ImpactSection snapshot={snapshot} />
        <WaysToHelpSection />
        <CoffeeSection />
        <OrganizationsTeaserSection />
        <FaqSection />
        <FinalCtaSection />
      </main>

      <PublicFooter />
      <CoffeeTeaser />
    </div>
  );
}
