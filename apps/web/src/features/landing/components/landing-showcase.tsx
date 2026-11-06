import { Link } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import {
  DEMO_TEMPLATE_IDS,
  templateDemoHref,
  templateName,
} from '../../portals/templates/demo/demo-templates';
import { IconArrowRight } from './landing-icons';
import landing from './landing.module.scss';
import styles from './showcase.module.scss';

/** Plantillas premium: todavía no están en el código, se muestran como próximamente y sin precio. */
const PREMIUM_NAMES = ['Álbum', 'Linterna', 'Revelado', 'Velitas', 'Terminal'] as const;

export const LANDING_TEMPLATES_ID = 'plantillas';
export const LANDING_COFFEE_ID = 'cafe';

/**
 * Galería de plantillas: las 14 del motor más la Clásica son gratuitas. Las
 * premium se marcan como próximamente, sin precio. Las miniaturas salen de
 * `public/template-previews` (datos de demostración, no de una organización real).
 * Cada una abre su vista de ejemplo completa (`/plantillas/:id`), desde donde se
 * registra la fundación con esa plantilla.
 */
export function TemplateGallerySection() {
  return (
    <section
      id={LANDING_TEMPLATES_ID}
      className={landing.section}
      aria-labelledby="landing-templates-title"
    >
      <div className={landing.container}>
        <div className={landing.heading}>
          <p className={landing.eyebrow}>Plantillas para tu portal</p>
          <h2 id="landing-templates-title" className={landing.heading__title}>
            Elige la forma de tu portal. Todas son gratis.
          </h2>
          <p className={landing.heading__lead}>
            Cambias el diseño cuando quieras. Tus animales, tus datos y tus campañas se ven igual en
            cada plantilla.
          </p>
        </div>

        <ul className={styles.gallery} aria-label="Plantillas gratuitas">
          {DEMO_TEMPLATE_IDS.map((id) => (
            <li key={id} className={styles.tile}>
              <Link
                to={templateDemoHref(id)}
                className={styles.tile__link}
                aria-label={`Ver la plantilla ${templateName(id)} con datos de ejemplo`}
              >
                <img
                  src={`/template-previews/${id}-390.jpg`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={390}
                  height={488}
                />
                <p className={styles.tile__name}>
                  {templateName(id)}
                  <span className={styles.tile__cta}>Ver ejemplo</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <h3 className={styles.subhead}>Próximamente, plantillas premium</h3>
        <ul className={styles.gallery} aria-label="Plantillas premium, próximamente">
          {PREMIUM_NAMES.map((name) => (
            <li key={name} className={cn(styles.tile, styles['tile--soon'])}>
              <span className={styles.tile__badge}>Próximamente</span>
              <div className={styles['tile--text']}>
                <span className={styles.tile__name}>{name}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className={landing.orgs__cta}>
          <Link to="/register" className={cn(landing.btn, landing['btn--primary'])}>
            Crear mi portal gratis
            <IconArrowRight className={landing.btn__icon} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Café San Pedro: AdoptaFácil compra café colombiano y lo vende. El 20 % del
 * margen bruto (precio de venta menos precio de compra) de cada venta apoya a los
 * animales. No se promete una cifra fija por bolsa, porque los precios cambian.
 */
export function CoffeeSection() {
  return (
    <section
      id={LANDING_COFFEE_ID}
      className={landing.section}
      aria-labelledby="landing-coffee-title"
    >
      <div className={landing.container}>
        <div className={styles.coffee}>
          <img
            src="/landing/cafe-san-pedro.webp"
            alt="Dos bolsas de Café San Pedro, una de 250 g y otra más grande, con la etiqueta de AdoptaFácil"
            loading="lazy"
            decoding="async"
            width={1100}
            height={1100}
          />
          <div className={styles.coffee__body}>
            <p className={landing.eyebrow}>Iniciativa de AdoptaFácil</p>
            <h2 id="landing-coffee-title" className={landing.heading__title}>
              Un café que también cuida.
            </h2>
            <p>
              AdoptaFácil es gratis para los refugios. Para mantenerlo, compramos café colombiano y
              lo vendemos. El 20 % del margen bruto de cada venta, calculado como precio de venta
              menos precio de compra, apoya a los animales.
            </p>
            <p className={styles.coffee__fine}>
              El detalle de cada campaña se publica cuando esté confirmado.
            </p>
            <div className={landing.orgs__cta}>
              <Link to="/campanas" className={cn(landing.btn, landing['btn--ink'])}>
                Ver campañas que apoyamos
                <IconArrowRight className={landing.btn__icon} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
