import { useId, useState } from 'react';
import type { DocumentType } from '@adoptafacil/contracts';
import { DOCUMENT_HELP } from '../model/document-help';
import { OfficialContactButtons } from './official-contact-buttons';
import styles from './missing-document-help.module.scss';

export interface MissingDocumentHelpProps {
  type: DocumentType;
  /** Abierto desde el inicio (p. ej. cuando la organización no tiene ningún documento). */
  defaultOpen?: boolean;
}

/**
 * Alerta proactiva del onboarding (anexo #4 · F20): si la organización no
 * tiene un documento, en vez de quedarse atascada ve qué es, el paso a paso
 * general, qué desbloquea y dos botones para pedir ayuda (WhatsApp y correo
 * oficiales, D10). No envía nada por su cuenta ni lee lo que la persona
 * escribe: abre WhatsApp o el correo con un mensaje que ella puede editar.
 */
export function MissingDocumentHelp({ type, defaultOpen = false }: MissingDocumentHelpProps) {
  const help = DOCUMENT_HELP[type];
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  if (!help) return null;

  return (
    <div className={styles.help} data-testid={`missing-document-help-${type}`}>
      <button
        type="button"
        className={styles.help__toggle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Ocultar ayuda' : 'No lo tengo todavía'}
      </button>
      {open && (
        <div id={panelId} className={styles.help__panel} role="region" aria-label={help.title}>
          <p className={styles.help__title}>{help.title}</p>
          <p className={styles.help__text}>
            No te preocupes, le pasa a muchas organizaciones. {help.what}
          </p>
          <ol className={styles.help__steps}>
            {help.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className={styles.help__unlocks}>{help.unlocks}</p>
          <p className={styles.help__text}>
            Te acompañamos en el trámite. Escríbenos y una persona del equipo te explica el paso a
            paso para tu caso.
          </p>
          <OfficialContactButtons
            whatsappMessage={help.whatsappMessage}
            emailSubject={help.title.replace(/[¿?]/g, '')}
          />
        </div>
      )}
    </div>
  );
}
