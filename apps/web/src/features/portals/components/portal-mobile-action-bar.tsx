import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import styles from './portal-mobile-action-bar.module.scss';

export interface PortalMobileActionBarProps {
  /** Lleva a la sección "Mascotas en adopción", donde se elige el animal. */
  onAdopt: () => void;
  /** Enlace para donar; sin él (pagos apagados o la organización aún no
   *  recibe donaciones) la barra solo ofrece "Adoptar". */
  donateHref?: string;
}

/**
 * Barra fija abajo en el portal público, solo en celular: las dos acciones
 * principales siempre a mano. "Adoptar" no inventa una adopción genérica:
 * lleva al catálogo, donde cada animal tiene su propia solicitud.
 */
export function PortalMobileActionBar({ onAdopt, donateHref }: PortalMobileActionBarProps) {
  // Marca la página para que el botón "Ayuda" suba por encima de la barra.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('af-has-bottom-bar');
    return () => root.classList.remove('af-has-bottom-bar');
  }, []);

  return (
    <nav aria-label="Acciones rápidas" className={styles.bar} data-testid="portal-mobile-bar">
      <button
        type="button"
        className={cn(styles.action, styles['action--primary'])}
        onClick={onAdopt}
      >
        Adoptar
      </button>
      {donateHref && (
        <Link
          to={donateHref}
          className={cn(styles.action, styles['action--secondary'])}
          data-testid="portal-mobile-donate"
        >
          Donar
        </Link>
      )}
    </nav>
  );
}
