import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { PublicHeroBanner } from '@adoptafacil/contracts';
import { useSession } from '../../../shell/auth';
import { FullPageLoading, PublicFooter, PublicNavbar } from '../../../shell/layout';
import { useDocumentTitle } from '../../../lib/use-document-title';
import {
  ActiveCampaignsSection,
  AdoptionStepsSection,
  CommunitySection,
  FinalCtaSection,
  ForOrganizationsSection,
  ImpactSection,
  LANDING_CATALOG_ID,
  LandingHero,
  PromisesSection,
  WaitingAnimalsSection,
  WaysToHelpSection,
  useCatalogSnapshot,
} from '../../landing';
import styles from '../../landing/components/landing.module.scss';
import { GeneralCatalogSection } from '../components/general-catalog-section';

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

/** Los enlaces `/#adoptar` y `/#organizaciones` del navbar llevan a su sección
 *  (react-router no desplaza a anclas por sí solo). */
function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    target?.scrollIntoView({ block: 'start' });
  }, [hash]);
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
  const heroBannerPhotos = useHeroBannerPhotos();
  const snapshot = useCatalogSnapshot();
  useDocumentTitle('Adopción responsable en Colombia');
  useScrollToHash();

  if (status === 'loading') {
    return <FullPageLoading label="Verificando tu sesión…" />;
  }

  if (status === 'authenticated') {
    return <Navigate to="/inicio" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--af-cream)] text-foreground">
      <PublicNavbar />

      <main className="flex-1">
        {/* Landing marca v3 (rediseño 2026-10): primero animales reales y
            "Quiero adoptar", luego las formas de ayudar (donar y recursos
            solo con su módulo encendido), cómo adoptar, la red en cifras
            reales, el catálogo completo, campañas, comunidad, la propuesta
            para organizaciones y el cierre. Ninguna cifra que no salga de
            la API. */}
        <LandingHero snapshot={snapshot} />
        <WaitingAnimalsSection snapshot={snapshot} />
        <WaysToHelpSection />
        <AdoptionStepsSection photos={heroBannerPhotos} />
        <ImpactSection snapshot={snapshot} />

        <section id={LANDING_CATALOG_ID} className={styles.catalog} aria-label="Catálogo">
          <div className="mx-auto w-full max-w-6xl space-y-8 px-4 sm:px-6">
            <GeneralCatalogSection />
          </div>
        </section>

        <ActiveCampaignsSection />
        <CommunitySection />
        <ForOrganizationsSection />
        <PromisesSection />
        <FinalCtaSection />
      </main>

      <PublicFooter />
    </div>
  );
}
