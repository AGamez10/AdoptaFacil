import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@adoptafacil/ui';
import { useCapabilities } from '../../../shell/capabilities';
import styles from './google-sign-in-button.module.scss';

export interface GoogleSignInButtonProps {
  /** Called with the raw ID token (real Google credential, or the fake test
   *  token in dev) once the user picks an account. */
  onCredential: (idToken: string) => void | Promise<void>;
  disabled?: boolean;
  /** Google's button label: "Continuar con Google" (default) or "Registrarse con Google". */
  text?: 'continue_with' | 'signup_with' | 'signin_with';
}

/** Minimal shape of the `google.accounts.id` API this component uses (Google
 *  Identity Services, loaded from the CDN script — no npm types needed for
 *  this small a surface). */
interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
        ux_mode?: 'popup' | 'redirect';
        context?: 'signin' | 'signup' | 'use';
        itp_support?: boolean;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GIS_SCRIPT_ID = 'google-identity-services';

let gisPromise: Promise<void> | null = null;

/** Load the Google Identity Services script once (shared across every mount
 *  of this component on the page) and resolve when it's ready. A failed load
 *  is forgotten so the next mount tries again instead of waiting forever on a
 *  script tag whose `error` event already fired. */
function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    document.getElementById(GIS_SCRIPT_ID)?.remove();
    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google script'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    gisPromise = null;
    throw error;
  });
  return gisPromise;
}

/**
 * The Google OAuth Client ID to use. The API's own value comes first (it is
 * the audience the API verifies the token against, so the two can never
 * disagree); `VITE_GOOGLE_CLIENT_ID` is the build-time fallback.
 */
export function useGoogleClientId(): string | undefined {
  const { capabilities } = useCapabilities();
  return capabilities.googleClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;
}

/**
 * Whether a Google button can be shown at all (Ola 1, R0-2, AF-029): the API
 * must serve `POST /auth/google` (capabilities) AND either a real Client ID
 * is known or this is the Vite dev server. A production build without a
 * Client ID shows no Google button — never the "(prueba)" one. `vite build`
 * always runs in mode "production" (even if a stray NODE_ENV=development
 * leaks in from a local .env), and `import.meta.env.MODE` is replaced at
 * build time, so that branch is dead code there.
 */
export function useGoogleSignInAvailable(): boolean {
  const { capabilities } = useCapabilities();
  const clientId = useGoogleClientId();
  return capabilities.googleSignIn && (Boolean(clientId) || import.meta.env.MODE !== 'production');
}

/**
 * "Continuar con Google" (T-Google-SignIn). With a real Client ID (from the
 * API or `VITE_GOOGLE_CLIENT_ID`), renders the REAL Google Identity Services
 * button and forwards its ID token to `onCredential`. Popup mode: the page
 * never navigates away, so whatever the person was doing (the donation, the
 * volunteering day, the offer, the invitation) is still in memory when the
 * token comes back. With no Client ID (dev default against
 * `AUTH_IDENTITY_DRIVER=fake`), renders a plain button that prompts for a
 * test email and sends the FakeIdentityAdapter's documented token
 * (`fake:<email>:<name>`). That fallback exists only on the dev server (see
 * useGoogleSignInAvailable); callers render this component only when that
 * hook says so.
 */
export function GoogleSignInButton({
  onCredential,
  disabled,
  text = 'continue_with',
}: GoogleSignInButtonProps) {
  const clientId = useGoogleClientId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptError, setScriptError] = useState(false);
  const buttonId = useId();
  // The latest callback, read when Google answers: re-rendering the parent
  // (every keystroke in the form) must not re-initialize and re-draw Google's
  // button.
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setScriptError(false);
    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          context: text === 'signup_with' ? 'signup' : 'signin',
          itp_support: true,
          callback: (response) => {
            if (disabledRef.current) return;
            void onCredentialRef.current(response.credential);
          },
        });
        const width = Math.min(400, Math.max(200, containerRef.current.offsetWidth || 320));
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text,
          locale: 'es-419',
          logo_alignment: 'center',
          width,
        });
      })
      .catch(() => {
        if (!cancelled) setScriptError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (clientId) {
    if (scriptError) {
      return (
        <p className={styles.error} role="alert">
          No pudimos cargar el inicio de sesión con Google. Revisa tu conexión o recarga la página;
          también puedes usar tu correo y contraseña.
        </p>
      );
    }
    return (
      <div className={styles.wrapper}>
        <div
          ref={containerRef}
          className={styles.gis}
          data-testid="google-sign-in-container"
          aria-busy={disabled || undefined}
        />
        {import.meta.env.MODE !== 'production' && (
          <p className={styles.hint} data-testid="google-sign-in-dev-hint">
            Solo en desarrollo: si el botón no aparece, agrega{' '}
            <code>{typeof window === 'undefined' ? '' : window.location.origin}</code> a los
            «Orígenes autorizados de JavaScript» de este Client ID en Google Cloud Console.
          </p>
        )}
      </div>
    );
  }

  // Dev-server fallback: no real Client ID configured (see .env.example).
  // Never rendered by a production build (R0-2, AF-029).
  if (import.meta.env.MODE === 'production') return null;

  const handleTestSignIn = () => {
    const email = window.prompt(
      'Modo prueba (sin credenciales reales de Google): correo a usar',
      'nueva.persona@example.com',
    );
    if (!email) return;
    const name = window.prompt('Nombre para mostrar', 'Persona de Prueba') || email;
    void onCredential(`fake:${email.trim()}:${name.trim()}`);
  };

  return (
    <div className={styles.wrapper}>
      <Button
        type="button"
        variant="outline"
        className={styles.button}
        disabled={disabled}
        onClick={handleTestSignIn}
        id={buttonId}
        data-testid="google-sign-in-fake-button"
      >
        Continuar con Google (prueba)
      </Button>
      <p className={styles.hint}>
        Sin credenciales reales de Google configuradas — este botón usa el adaptador de prueba.
      </p>
    </div>
  );
}
