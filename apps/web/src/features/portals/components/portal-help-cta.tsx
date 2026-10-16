import type { OrganizationPublic } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { DonationsActivatingNotice } from '../../donations/components/donations-activating-notice';
import { buildDonateHref } from './portal-donate-cta';
import { IconGift } from './portal-icons';
import styles from '../styles/public-portal.module.scss';

export interface PortalHelpCtaProps {
  organization: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location' | 'slug'>;
  /** `false` cuando la org aún no recibe donaciones en línea. */
  donationsActive?: boolean;
  /** Desplaza a "Mascotas en adopción" (alternativa mientras activa donaciones). */
  onBrowseAnimals?: () => void;
}

const HEADING_ID = 'portal-help-cta-heading';

/**
 * Banner de invitación a donar (§M14, rediseño T-D04) — ancla real del ítem de
 * navegación "Cómo ayudar". Copy genérico de invitación (sin cifras ni
 * afirmaciones específicas de la organización, nada fabricado); el único dato
 * real es el enlace, que reutiliza `buildDonateHref` TAL CUAL.
 */
export function PortalHelpCta({
  organization,
  donationsActive = true,
  onBrowseAnimals,
}: PortalHelpCtaProps) {
  if (!donationsActive) {
    // Mismo ancla "Cómo ayudar", pero sin prometer una donación en línea que
    // todavía no funciona: mensaje cálido + otras formas reales de ayudar.
    return (
      <section
        aria-label="Cómo ayudar"
        id="portal-help-cta"
        style={{ scrollMarginTop: '5rem' }}
        className="rounded-lg border border-border bg-card p-6"
      >
        <DonationsActivatingNotice
          organizationName={organization.name}
          portalPath={organization.slug ? `/o/${encodeURIComponent(organization.slug)}` : undefined}
          onBrowseAnimals={onBrowseAnimals}
          data-testid="portal-donate-activating"
        />
      </section>
    );
  }
  return (
    <section aria-labelledby={HEADING_ID} id="portal-help-cta" style={{ scrollMarginTop: '5rem' }}>
      <div className={styles.ctaBanner}>
        <div>
          <h2 id={HEADING_ID} className={styles.ctaBanner__title}>
            Pequeñas acciones, grandes cambios
          </h2>
          <p className={styles.ctaBanner__text}>
            Tu apoyo nos permite seguir rescatando, cuidando y encontrando hogares para más
            animales.
          </p>
        </div>
        <a
          href={buildDonateHref(organization)}
          className={cn(styles.btn, styles['btn--lg'], styles['btn--primary'])}
          data-testid="portal-help-cta-donate"
        >
          <IconGift className="mr-1.5 h-4 w-4" />
          Quiero donar
        </a>
      </div>
    </section>
  );
}
