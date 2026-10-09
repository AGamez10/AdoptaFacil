import { Link } from 'react-router-dom';
import { Brand } from './brand';
import styles from './public-footer.module.scss';

/**
 * Public footer — REFACTOR-VISUAL v2, Fase 3. El mockup de referencia incluye
 * redes sociales y un formulario de suscripción, pero AdoptaFácil no tiene
 * cuentas de redes propias ni un backend de newsletter — inventar esos
 * enlaces/formulario sería fabricar funcionalidad que no existe. Se mantiene
 * honesto: marca + los mismos enlaces reales del navbar + año real.
 */
export function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footer__row}>
        <Brand inverse to="/" />

        <nav aria-label="Enlaces del pie de página" className={styles.footer__links}>
          <Link to="/" className={styles.footer__link}>
            Mascotas
          </Link>
          <Link to="/campanas" className={styles.footer__link}>
            Campañas
          </Link>
          <Link to="/recursos" className={styles.footer__link}>
            Banco de recursos
          </Link>
          <Link to="/marketplace" className={styles.footer__link}>
            Marketplace
          </Link>
          <Link to="/login" className={styles.footer__link}>
            Ingresar
          </Link>
          <Link to="/register" className={styles.footer__link}>
            Publicar mi refugio
          </Link>
        </nav>

        <p className={styles.footer__meta}>AdoptaFácil — rescate animal en Colombia</p>
      </div>
      {/* Legal (Ley 1581): siempre a un clic desde cualquier página pública. */}
      <div className={styles.footer__row}>
        <nav aria-label="Legal" className={styles.footer__links}>
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
        </nav>
      </div>
    </footer>
  );
}
