import { OfficialContactButtons } from './official-contact-buttons';
import styles from './missing-document-help.module.scss';

/**
 * Tarjeta de bienvenida del onboarding documental (anexo #4 · F20): se
 * muestra cuando la organización todavía no ha subido nada, para que no
 * abandone el registro por no tener RUT o cámara de comercio.
 */
export function OnboardingHelpCard() {
  return (
    <div className={styles.help__panel} data-testid="onboarding-help-card">
      <p className={styles.help__title}>¿Empiezas sin documentos? No pasa nada.</p>
      <p className={styles.help__text}>
        Puedes usar AdoptaFácil mientras te formalizas: publica tus animales y arma tu portal. Si te
        falta el RUT o el registro en la Cámara de Comercio, toca &quot;No lo tengo todavía&quot; en
        cada documento para ver el paso a paso, o escríbenos y te acompañamos.
      </p>
      <OfficialContactButtons
        whatsappMessage="Hola, estoy empezando en AdoptaFácil y necesito ayuda con los documentos de mi organización."
        emailSubject="Ayuda con los documentos de mi organización"
        showDetails
      />
    </div>
  );
}
