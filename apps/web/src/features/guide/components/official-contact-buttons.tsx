import { cn } from '@adoptafacil/ui';
import {
  OFFICIAL_EMAIL,
  OFFICIAL_WHATSAPP_DISPLAY,
  officialMailtoUrl,
  officialWhatsappUrl,
} from '../../../lib/contact';
import { IconMail, IconWhatsapp } from '../../landing/components/landing-icons';
import styles from './official-contact-buttons.module.scss';

export interface OfficialContactButtonsProps {
  /** Mensaje prellenado de WhatsApp (la persona lo puede editar antes de enviar). */
  whatsappMessage?: string;
  /** Asunto del correo. */
  emailSubject?: string;
  /** `dark` sobre fondos navy/teal; `light` (por defecto) sobre fondos claros. */
  tone?: 'light' | 'dark';
  /** Muestra el número y el correo bajo cada botón (útil para quien prefiere copiarlos). */
  showDetails?: boolean;
  className?: string;
}

export interface ContactButtonsProps {
  /** Enlace `wa.me` ya armado; sin él no se pinta el botón de WhatsApp. */
  whatsappHref?: string | null;
  /** Enlace `mailto:` ya armado; sin él no se pinta el botón de correo. */
  emailHref?: string | null;
  whatsappLabel?: string;
  emailLabel?: string;
  whatsappDetail?: string;
  emailDetail?: string;
  tone?: 'light' | 'dark';
  className?: string;
}

/** Botones de WhatsApp y correo con los enlaces que se le den (de AdoptaFácil o de una organización). */
export function ContactButtons({
  whatsappHref,
  emailHref,
  whatsappLabel = 'Escribir por WhatsApp',
  emailLabel = 'Enviar un correo',
  whatsappDetail,
  emailDetail,
  tone = 'light',
  className,
}: ContactButtonsProps) {
  return (
    <div className={cn(styles.group, tone === 'dark' && styles['group--dark'], className)}>
      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(styles.button, styles['button--whatsapp'])}
          data-testid="contact-whatsapp"
        >
          <IconWhatsapp className={styles.icon} />
          <span className={styles.label}>
            {whatsappLabel}
            {whatsappDetail && <small className={styles.detail}>{whatsappDetail}</small>}
          </span>
        </a>
      )}
      {emailHref && (
        <a
          href={emailHref}
          className={cn(styles.button, styles['button--mail'])}
          data-testid="contact-email"
        >
          <IconMail className={styles.icon} />
          <span className={styles.label}>
            {emailLabel}
            {emailDetail && <small className={styles.detail}>{emailDetail}</small>}
          </span>
        </a>
      )}
    </div>
  );
}

/**
 * Contacto oficial de AdoptaFácil a un clic (decisión D10, anexo #4):
 * WhatsApp 302 852 8926 y adoptafacil.oficial@gmail.com. Abre la app de
 * WhatsApp o el cliente de correo; la plataforma no envía nada por su cuenta.
 */
export function OfficialContactButtons({
  whatsappMessage,
  emailSubject,
  tone = 'light',
  showDetails = false,
  className,
}: OfficialContactButtonsProps) {
  return (
    <ContactButtons
      whatsappHref={officialWhatsappUrl(whatsappMessage)}
      emailHref={officialMailtoUrl(emailSubject)}
      whatsappDetail={showDetails ? OFFICIAL_WHATSAPP_DISPLAY : undefined}
      emailDetail={showDetails ? OFFICIAL_EMAIL : undefined}
      tone={tone}
      className={className}
    />
  );
}
