import { Link } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { useFeature } from '../../../shell/capabilities';
import { orgWhatsappUrl } from '../model/org-contact';
import { buildDonateHref } from './portal-donate-cta';
import styles from '../styles/public-portal.module.scss';

export interface PortalHeaderActionsProps {
  organization: Pick<
    OrganizationPublic,
    'id' | 'name' | 'logoUrl' | 'nit' | 'location' | 'whatsapp'
  >;
  onBrowseCatalog: () => void;
}

/**
 * Acciones del hero del portal (Ola 3, R3-5). Una sola acción sólida
 * —conocer a los animales— y, como secundaria, hablar con la organización
 * por su WhatsApp público. "Apadrinar" y "Donar" solo existen si su módulo
 * está encendido (Ola 1, R1-1): con pagos apagados el portal no promete
 * dinero. Cada animal tiene su propio flujo de adopción en su ficha; aquí no
 * se inventa una adopción "genérica".
 */
export function PortalHeaderActions({ organization, onBrowseCatalog }: PortalHeaderActionsProps) {
  const payments = useFeature('payments');
  const sponsorships = useFeature('sponsorships');
  const whatsapp = orgWhatsappUrl(
    organization.whatsapp,
    `Hola, vi el portal de ${organization.name} en AdoptaFácil y quiero más información.`,
  );

  return (
    <div data-testid="portal-header-actions" className={styles.heroActions}>
      <button
        type="button"
        className={cn(styles.btn, styles['btn--lg'], styles['btn--primary'])}
        onClick={onBrowseCatalog}
      >
        Conocer a nuestros animales
      </button>
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(styles.btn, styles['btn--lg'], styles['btn--glass'])}
          data-testid="portal-whatsapp-cta"
        >
          Escribir por WhatsApp
        </a>
      )}
      {sponsorships && (
        <button
          type="button"
          className={cn(styles.btn, styles['btn--lg'], styles['btn--glass'])}
          onClick={onBrowseCatalog}
        >
          Apadrinar
        </button>
      )}
      {payments && (
        <Link
          to={buildDonateHref(organization)}
          className={cn(styles.btn, styles['btn--lg'], styles['btn--glass'])}
          data-testid="portal-donate-cta"
        >
          Donar
        </Link>
      )}
    </div>
  );
}
