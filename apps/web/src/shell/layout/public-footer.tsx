import { Link } from 'react-router-dom';
import {
  OFFICIAL_EMAIL,
  OFFICIAL_WHATSAPP_DISPLAY,
  officialMailtoUrl,
  officialWhatsappUrl,
} from '../../lib/contact';
import { useFeature } from '../capabilities';
import { Brand } from './brand';
import styles from './public-footer.module.scss';

/**
 * Public footer. Honesto: marca, los mismos enlaces reales del navbar (solo
 * módulos encendidos, Ola 1 R1-1) y, desde la Ola 3, los canales oficiales de
 * contacto (D10). Sin redes ni newsletter que AdoptaFácil no tiene.
 */
export function PublicFooter() {
  const resources = useFeature('resources');
  const marketplace = useFeature('marketplace');
  return (
    <footer className={styles.footer}>
      <div className={styles.footer__row}>
        <div className={styles.footer__brand}>
          <Brand inverse to="/" />
          <p className={styles.footer__tagline}>
            Infraestructura digital para el rescate animal en Colombia.
          </p>
        </div>

        <nav aria-label="Enlaces del pie de página" className={styles.footer__links}>
          <Link to="/#adoptar" className={styles.footer__link}>
            Animales en adopción
          </Link>
          <Link to="/campanas" className={styles.footer__link}>
            Campañas
          </Link>
          {resources && (
            <Link to="/recursos" className={styles.footer__link}>
              Banco de recursos
            </Link>
          )}
          {marketplace && (
            <Link to="/marketplace" className={styles.footer__link}>
              Marketplace
            </Link>
          )}
          <Link to="/#organizaciones" className={styles.footer__link}>
            Para organizaciones
          </Link>
          <Link to="/login" className={styles.footer__link}>
            Ingresar
          </Link>
        </nav>

        <address className={styles.footer__contact}>
          <span className={styles.footer__contactTitle}>Contacto</span>
          <a
            href={officialWhatsappUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.footer__link}
          >
            WhatsApp {OFFICIAL_WHATSAPP_DISPLAY}
          </a>
          <a href={officialMailtoUrl()} className={styles.footer__link}>
            {OFFICIAL_EMAIL}
          </a>
        </address>
      </div>
      <p className={styles.footer__meta}>
        © {new Date().getFullYear()} AdoptaFácil · Rescate animal en Colombia
      </p>
    </footer>
  );
}
