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
    <div className={cn(styles.group, tone === 'dark' && styles['group--dark'], className)}>
      <a
        href={officialWhatsappUrl(whatsappMessage)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(styles.button, styles['button--whatsapp'])}
        data-testid="contact-whatsapp"
      >
        <IconWhatsapp className={styles.icon} />
        <span className={styles.label}>
          Escribir por WhatsApp
          {showDetails && <small className={styles.detail}>{OFFICIAL_WHATSAPP_DISPLAY}</small>}
        </span>
      </a>
      <a
        href={officialMailtoUrl(emailSubject)}
        className={cn(styles.button, styles['button--mail'])}
        data-testid="contact-email"
      >
        <IconMail className={styles.icon} />
        <span className={styles.label}>
          Enviar un correo
          {showDetails && <small className={styles.detail}>{OFFICIAL_EMAIL}</small>}
        </span>
      </a>
    </div>
  );
}
