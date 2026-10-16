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
 * Public footer, marca v3. Honesto: marca, los mismos enlaces reales del
 * navbar (solo módulos encendidos, Ola 1 R1-1), los canales oficiales de
 * contacto (D10) y los documentos legales. Sin redes ni boletín que
 * AdoptaFácil no tiene.
 */
export function PublicFooter() {
  const resources = useFeature('resources');
  const marketplace = useFeature('marketplace');
  const payments = useFeature('payments');
  return (
    <footer className={styles.footer}>
      <svg
        className={styles.footer__wave}
        viewBox="0 0 1440 48"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 48V24C240 0 480 0 720 20s480 24 720 0v28z" fill="currentColor" />
      </svg>
      <div className={styles.footer__inner}>
        <div className={styles.footer__brand}>
          <Brand inverse to="/" />
          <p className={styles.footer__tagline}>
            Infraestructura digital para el rescate animal en Colombia.
          </p>
          <address className={styles.footer__contact}>
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

        <nav aria-label="Enlaces del pie de página" className={styles.footer__cols}>
          <div className={styles.footer__col}>
            <p className={styles.footer__title}>Ayudar</p>
            <Link to="/adoptar" className={styles.footer__link}>
              Animales en adopción
            </Link>
            <Link to="/campanas" className={styles.footer__link}>
              Campañas
            </Link>
            {payments && (
              <Link to="/donaciones" className={styles.footer__link}>
                Donar
              </Link>
            )}
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
          </div>
          <div className={styles.footer__col}>
            <p className={styles.footer__title}>Organizaciones</p>
            <Link to="/#organizaciones" className={styles.footer__link}>
              Para organizaciones
            </Link>
            <Link to="/register" className={styles.footer__link}>
              Registrar mi organización
            </Link>
            <Link to="/login" className={styles.footer__link}>
              Ingresar
            </Link>
          </div>
          {/* Legal (Ley 1581): siempre a un clic desde cualquier página pública. */}
          <div className={styles.footer__col} aria-label="Legal" role="group">
            <p className={styles.footer__title}>Legal</p>
            <Link to="/legal/terminos" className={styles.footer__link}>
              Términos
            </Link>
            <Link to="/legal/politica-de-datos" className={styles.footer__link}>
              Tratamiento de datos
            </Link>
            <Link to="/legal/aviso-de-privacidad" className={styles.footer__link}>
              Aviso de privacidad
            </Link>
            <Link to="/legal/cookies" className={styles.footer__link}>
              Cookies
            </Link>
            <Link to="/legal/alcance" className={styles.footer__link}>
              Qué es y qué no es AdoptaFácil
            </Link>
            <a
              href="mailto:adoptafacil.oficial@gmail.com?subject=Reporte"
              className={styles.footer__link}
            >
              Reportar maltrato o contenido
            </a>
          </div>
        </nav>
      </div>
      <p className={styles.footer__meta}>
        © {new Date().getFullYear()} AdoptaFácil · Hecho en Colombia para los animales que esperan
        hogar
      </p>
    </footer>
  );
}
