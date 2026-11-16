import { useEffect, useState } from 'react';
import { Button } from '@adoptafacil/ui';
import {
  isIosSafari,
  isStandalone,
  markInstalled,
  recentlyDismissed,
  rememberDismissed,
  wasInstalled,
  type BeforeInstallPromptEvent,
} from '../../lib/install-app';
import { COOKIE_CONSENT_CHANGE_EVENT, readCookieConsent } from '../consent/cookie-consent';
import styles from '../consent/cookie-consent-banner.module.scss';

/**
 * Invitación a instalar AdoptaFácil como app. Estilo del aviso de cookies y
 * descartable. Sale después de que la persona decide sobre las cookies (no
 * compite con ese aviso), y no sale si la app ya está instalada o si la
 * persona dijo "Ahora no" hace poco.
 *
 * - Android/escritorio: cuando Chrome ofrece instalar (`beforeinstallprompt`),
 *   el botón "Instalar" abre el diálogo nativo.
 * - iPhone/iPad (Safari): no hay botón de instalación; se explica el paso
 *   "Compartir → Agregar a inicio".
 */
export function InstallAppBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [consented, setConsented] = useState(() => readCookieConsent() !== null);
  const [hidden, setHidden] = useState(
    () => wasInstalled() || isStandalone() || recentlyDismissed(),
  );

  useEffect(() => {
    const onBefore = (event: Event): void => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = (): void => {
      markInstalled();
      setHidden(true);
    };
    const onConsent = (): void => setConsented(readCookieConsent() !== null);
    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsent);
    setIos(isIosSafari());
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsent);
    };
  }, []);

  if (hidden || !consented || (!prompt && !ios)) return null;

  const dismiss = (): void => {
    rememberDismissed();
    setHidden(true);
  };

  const install = async (): Promise<void> => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === 'accepted') {
      markInstalled();
      setHidden(true);
    } else {
      rememberDismissed();
    }
  };

  return (
    <section
      className={styles.banner}
      role="region"
      aria-labelledby="install-banner-title"
      data-testid="install-app-banner"
    >
      <h2 id="install-banner-title" className={styles.banner__title}>
        Instala AdoptaFácil en tu celular
      </h2>
      <p className={styles.banner__text}>
        {prompt
          ? 'Ábrela con un toque desde tu pantalla de inicio, a pantalla completa y sin barra del navegador.'
          : 'Toca el botón Compartir de Safari y luego "Agregar a inicio". Así queda en tu pantalla de inicio.'}
      </p>
      <div className={styles.banner__actions}>
        {prompt ? (
          <Button onClick={() => void install()}>Instalar</Button>
        ) : (
          <Button onClick={dismiss}>Entendido</Button>
        )}
        <Button variant="outline" onClick={dismiss}>
          Ahora no
        </Button>
      </div>
    </section>
  );
}
