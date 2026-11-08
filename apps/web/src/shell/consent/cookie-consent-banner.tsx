import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@adoptafacil/ui';
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_POLICY_PATH,
  OPEN_COOKIE_SETTINGS_EVENT,
  readCookieConsent,
  saveCookieConsent,
  type CookieConsent,
} from './cookie-consent';
import styles from './cookie-consent-banner.module.scss';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={open ? styles['chevron--open'] : styles.chevron}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

interface CategoryProps {
  title: string;
  description: string;
  defaultOpen?: boolean;
  /** Sin `onChange` la categoría es obligatoria ("Siempre activo"). */
  checked?: boolean;
  onChange?: (next: boolean) => void;
}

function CookieCategory({
  title,
  description,
  defaultOpen = false,
  checked,
  onChange,
}: CategoryProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className={styles.category}>
      <div className={styles.category__row}>
        <button
          type="button"
          className={styles.category__toggle}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronIcon open={open} />
          <span>{title}</span>
        </button>
        {onChange ? (
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={title}
            className={styles.switch}
            onClick={() => onChange(!checked)}
          >
            <span className={styles.switch__thumb} />
          </button>
        ) : (
          <span className={styles.category__always}>Siempre activo</span>
        )}
      </div>
      {open ? (
        <p id={panelId} className={styles.category__desc}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Aviso de cookies + panel "Configuración de cookies". Sale en la primera
 * visita (y cuando cambia la versión de la Política de cookies) hasta que el
 * visitante decide. Se reabre desde el enlace "Configurar cookies" del pie.
 */
export function CookieConsentBanner() {
  const [consent, setConsent] = useState<CookieConsent | null>(() => readCookieConsent());
  // Sin almacenamiento disponible la decisión vale para esta visita.
  const [decidedThisVisit, setDecidedThisVisit] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statistics, setStatistics] = useState(consent?.statistics ?? false);
  const [marketing, setMarketing] = useState(consent?.marketing ?? false);

  useEffect(() => {
    const onChange = () => setConsent(readCookieConsent());
    const onOpen = () => {
      const current = readCookieConsent();
      setStatistics(current?.statistics ?? false);
      setMarketing(current?.marketing ?? false);
      setSettingsOpen(true);
    };
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onChange);
      window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
    };
  }, []);

  const decide = (choice: { statistics: boolean; marketing: boolean }) => {
    setConsent(saveCookieConsent(choice));
    setStatistics(choice.statistics);
    setMarketing(choice.marketing);
    setDecidedThisVisit(true);
    setSettingsOpen(false);
  };
  const acceptAll = () => decide({ statistics: true, marketing: true });
  const rejectAll = () => decide({ statistics: false, marketing: false });

  const showBanner = !consent && !decidedThisVisit && !settingsOpen;

  return (
    <>
      {showBanner ? (
        <section
          className={styles.banner}
          role="region"
          aria-labelledby="cookie-banner-title"
          data-testid="cookie-banner"
        >
          <h2 id="cookie-banner-title" className={styles.banner__title}>
            Nos importa tu privacidad
          </h2>
          <p className={styles.banner__text}>
            AdoptaFácil usa cookies necesarias para que el sitio funcione y sea seguro, por ejemplo
            para mantener tu sesión iniciada. Las cookies de estadísticas y de marketing solo se
            activan si tú lo permites, y puedes cambiar tu elección cuando quieras. Conoce los
            detalles en nuestra{' '}
            <Link to={COOKIE_POLICY_PATH} className={styles.link}>
              Política de cookies
            </Link>
            .
          </p>
          <div className={styles.banner__actions}>
            <Button onClick={acceptAll}>Aceptar todo</Button>
            <Button variant="outline" onClick={rejectAll}>
              Rechazar todo
            </Button>
            <Button
              variant="ghost"
              className={styles.settingsBtn}
              onClick={() => setSettingsOpen(true)}
            >
              Configuración de cookies
            </Button>
          </div>
        </section>
      ) : null}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className={styles.dialog}>
          <DialogHeader>
            <DialogTitle>Configuración de cookies</DialogTitle>
            <DialogDescription>
              Cambia tus preferencias para cada categoría de cookies. Para obtener más información,
              lee nuestra{' '}
              <Link
                to={COOKIE_POLICY_PATH}
                className={styles.link}
                onClick={() => setSettingsOpen(false)}
              >
                Política de cookies
              </Link>
              .
            </DialogDescription>
          </DialogHeader>

          <div className={styles.categories}>
            <CookieCategory
              title="Cookies obligatorias"
              defaultOpen
              description="Estas cookies son necesarias para que nuestro sitio web funcione y sea seguro: mantienen tu sesión iniciada y protegen el sitio contra robots y ataques. No se pueden desactivar."
            />
            <CookieCategory
              title="Cookies para estadísticas"
              checked={statistics}
              onChange={setStatistics}
              description="Nos ayudarían a entender, con datos agregados, cómo se usa el sitio (qué páginas se visitan, dónde hay errores) para mejorarlo. Hoy AdoptaFácil no usa ninguna; si las permites, solo se activarán cuando las incorporemos y lo anunciemos en la Política de cookies."
            />
            <CookieCategory
              title="Cookies de marketing"
              checked={marketing}
              onChange={setMarketing}
              description="Servirían para medir campañas y mostrarte contenido de AdoptaFácil en otros sitios. Hoy AdoptaFácil no usa ninguna; si las permites, solo se activarán cuando las incorporemos y lo anunciemos en la Política de cookies."
            />
          </div>

          <DialogFooter className={styles.dialog__footer}>
            <Button onClick={() => decide({ statistics, marketing })}>Confirmar</Button>
            <Button variant="outline" onClick={acceptAll}>
              Aceptar todo
            </Button>
            <Button variant="outline" onClick={rejectAll}>
              Rechazar todo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
