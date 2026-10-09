import type { OrganizationPublic } from '@adoptafacil/contracts';
import { orgMailtoUrl, orgWhatsappUrl } from '../model/org-contact';
import styles from './portal-adoption-steps.module.scss';

export interface PortalAdoptionStepsProps {
  organization: Pick<OrganizationPublic, 'name' | 'whatsapp' | 'contactEmail'>;
  onBrowseCatalog: () => void;
}

const HEADING_ID = 'portal-adoption-steps-heading';

/**
 * "Cómo adoptar" en el portal (Ola 3, R3-5 · F6). Reemplaza al banner de
 * "Quiero donar" mientras los pagos están apagados: el objetivo principal de
 * la página es la adopción, así que el cierre explica el proceso real
 * (elegir → solicitar → firmar el contrato → seguimiento) y ofrece hablar con
 * la organización por sus canales públicos. Ancla de "Cómo adoptar" en la nav.
 */
export function PortalAdoptionSteps({ organization, onBrowseCatalog }: PortalAdoptionStepsProps) {
  const whatsapp = orgWhatsappUrl(
    organization.whatsapp,
    `Hola, quiero adoptar en ${organization.name}. ¿Me cuentan cómo es el proceso?`,
  );
  const mail = orgMailtoUrl(organization.contactEmail);
  const steps = [
    {
      title: 'Elige',
      text: 'Mira las fichas, sus fotos y su historia. Tómate tu tiempo.',
    },
    {
      title: 'Solicita',
      text: `Llena la solicitud de adopción en línea. ${organization.name} la revisa y te contacta.`,
    },
    {
      title: 'Firma',
      text: 'Si todo encaja, firman el contrato de adopción en línea, con copia para descargar.',
    },
    {
      title: 'Acompañamos',
      text: 'Después de la adopción hacemos seguimiento para que la llegada a casa salga bien.',
    },
  ];

  return (
    <section
      id="portal-help-cta"
      aria-labelledby={HEADING_ID}
      className={styles.section}
      style={{ scrollMarginTop: '5rem' }}
    >
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Adopción responsable</p>
        <h2 id={HEADING_ID} className={styles.title}>
          Cómo adoptar en {organization.name}
        </h2>
        <p className={styles.lead}>
          Adoptar es un compromiso de muchos años. Por eso el proceso es claro y queda por escrito.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onBrowseCatalog}>
            Ver animales disponibles
          </button>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.secondary}
            >
              Preguntar por WhatsApp
            </a>
          )}
          {!whatsapp && mail && (
            <a href={mail} className={styles.secondary}>
              Escribir un correo
            </a>
          )}
        </div>
      </div>
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.step__index} aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <h3 className={styles.step__title}>{step.title}</h3>
              <p className={styles.step__text}>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
