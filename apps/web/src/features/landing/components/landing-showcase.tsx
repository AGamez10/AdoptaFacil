import { Link } from 'react-router-dom';
import {
  NEW_ORG_TRIAL_DAYS,
  PORTAL_TEMPLATES,
  type PortalTemplateId,
} from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { premiumPlanNames } from '../../portals/components/templates/template-picker';
import {
  DEMO_TEMPLATE_IDS,
  templateDemoHref,
  templateName,
} from '../../portals/templates/demo/demo-templates';
import { useFeaturedCoffeeHref } from '../model/use-featured-coffee';
import { IconArrowRight } from './landing-icons';
import landing from './landing.module.scss';
import styles from './showcase.module.scss';

const isPro = (id: PortalTemplateId) => PORTAL_TEMPLATES.find((t) => t.id === id)?.tier === 'paid';

/** Gratuitas y Pro por separado: cada plantilla aparece una sola vez. */
const FREE_IDS = DEMO_TEMPLATE_IDS.filter((id) => !isPro(id));
const PRO_IDS = DEMO_TEMPLATE_IDS.filter(isPro);

export const LANDING_TEMPLATES_ID = 'plantillas';
export const LANDING_COFFEE_ID = 'cafe';

function TemplateTile({ id, pro }: { id: PortalTemplateId; pro?: boolean }) {
  return (
    <li className={cn(styles.tile, pro && styles['tile--pro'])}>
      <Link
        to={templateDemoHref(id)}
        className={styles.tile__link}
        aria-label={`Ver la plantilla ${templateName(id)}${pro ? ' (Pro)' : ''} con datos de ejemplo`}
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
          <span>
            {templateName(id)}
            {pro && <span className={styles.tile__badge}>PRO</span>}
          </span>
          <span className={styles.tile__cta}>Ver ejemplo</span>
        </p>
      </Link>
    </li>
  );
}

/**
 * Galería de plantillas: primero las gratuitas (para siempre) y aparte, una
 * sola vez, las Pro. Las Pro se pueden elegir al registrarse: la organización
 * nueva las usa gratis durante su prueba ({@link NEW_ORG_TRIAL_DAYS} días) y
 * después necesita Crece o Pro; si no, su portal vuelve solo a una gratuita.
 * Las miniaturas salen de `public/template-previews` (datos de demostración).
 * Cada una abre su vista de ejemplo (`/plantillas/:id`), desde donde se
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
            Elige la forma de tu portal.
          </h2>
          <p className={landing.heading__lead}>
            Cambias el diseño cuando quieras. Tus animales, tus datos y tus campañas se ven igual en
            cada plantilla.
          </p>
        </div>

        <h3 className={styles.subhead}>Gratis, para siempre</h3>
        <ul className={styles.gallery} aria-label="Plantillas gratuitas">
          {FREE_IDS.map((id) => (
            <TemplateTile key={id} id={id} />
          ))}
        </ul>

        {PRO_IDS.length > 0 && (
          <div className={styles.pro} data-testid="landing-pro-templates">
            <div className={styles.pro__head}>
              <span className={styles.pro__badge}>PRO</span>
              <div>
                <h3 className={styles.pro__title}>Plantillas Pro</h3>
                <p className={styles.pro__lead}>
                  Elige una al crear tu portal y úsala gratis durante tus primeros{' '}
                  {NEW_ORG_TRIAL_DAYS} días. Después están en los planes {premiumPlanNames()}; si no
                  activas uno, tu portal pasa solo a una plantilla gratuita sin perder nada.
                </p>
              </div>
            </div>
            <ul className={styles.gallery} aria-label="Plantillas Pro">
              {PRO_IDS.map((id) => (
                <TemplateTile key={id} id={id} pro />
              ))}
            </ul>
          </div>
        )}

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
 * Café San Pedro: AdoptaFácil compra café colombiano y lo vende para sostener
 * la plataforma gratis para los refugios. El 20 % del margen bruto (precio de
 * venta menos precio de compra) de cada venta apoya a una campaña. No se
 * promete una cifra fija por bolsa, porque los precios cambian. Con un lote a
 * la venta, "Comprar café" abre la misma página del QR (`/c/<código>`): precio,
 * bolsas disponibles, campaña y pago. Sin lote, no se ofrece comprar.
 */
export function CoffeeSection() {
  const buyHref = useFeaturedCoffeeHref();
  return (
    <section
      id={LANDING_COFFEE_ID}
      className={landing.section}
      aria-labelledby="landing-coffee-title"
      data-testid="landing-coffee"
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
            <p className={landing.eyebrow}>Café San Pedro · Iniciativa de AdoptaFácil</p>
            <h2 id="landing-coffee-title" className={landing.heading__title}>
              Tu café mantiene AdoptaFácil gratis para los refugios.
            </h2>
            <p>
              No le cobramos a las fundaciones por lo esencial: portal, adopciones con contrato,
              campañas y transparencia. Para sostenerlo vendemos café colombiano, y el 20 % del
              margen bruto de cada bolsa (precio de venta menos precio de compra) va a la campaña
              que tú elijas.
            </p>
            <ul className={styles.coffee__steps}>
              <li>Eliges la campaña que quieres apoyar.</li>
              <li>Pagas en línea y te llega el comprobante por correo.</li>
              <li>Te enviamos el café y sigues tu pedido.</li>
            </ul>
            <div className={landing.orgs__cta}>
              {buyHref ? (
                <Link
                  to={buyHref}
                  className={cn(landing.btn, landing['btn--primary'])}
                  data-testid="coffee-buy"
                >
                  Comprar café
                  <IconArrowRight className={landing.btn__icon} />
                </Link>
              ) : (
                <p className={styles.coffee__fine}>
                  La venta en línea abre con el próximo lote. Mientras tanto, puedes apoyar una
                  campaña directamente.
                </p>
              )}
              <Link
                to="/campanas"
                className={cn(landing.btn, buyHref ? landing['btn--ghost'] : landing['btn--ink'])}
              >
                Ver campañas que apoyamos
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
