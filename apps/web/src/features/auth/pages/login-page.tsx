import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams, type Location } from 'react-router-dom';
import { Button } from '@adoptafacil/ui';
import { toApiError, useApiClient } from '../../../shell/api';
import { accessPathWithReturn, safeReturnTo, useSession } from '../../../shell/auth';
import { landingAfterSignIn } from '../../org/lib/portal-readiness';
import { AuthLayout } from '../components/auth-layout';
import { Field } from '../components/field';
import { FormAlert } from '../components/form-alert';
import { GoogleSignInButton, useGoogleSignInAvailable } from '../components/google-sign-in-button';
import { collectErrors, loginErrorMessage, validateEmail } from '../validation';

interface FromState {
  from?: Location;
}

/** Qué va a pasar en la ruta a la que se quiere volver, en palabras de la persona. */
const INTENT_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['/donaciones', 'donar a esta organización'],
  ['/donar', 'donar a esta organización'],
  ['/recursos/ofrecer', 'ofrecer lo que tienes'],
  ['/voluntariado', 'inscribirte a una jornada de voluntariado'],
  ['/adoptar', 'solicitar la adopción de un animal'],
  ['/apadrinar', 'apadrinar a un animal'],
  ['/campanas', 'aportar a una campaña'],
];

function intentLabelFor(path: string | null): string | null {
  if (!path) return null;
  const pathname = path.split(/[?#]/)[0];
  const match = INTENT_LABELS.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : 'seguir donde ibas';
}

/**
 * Login screen (replaces the T-021 stub). Controlled inputs, no native form
 * submit. On success the session is stored via useSession (T-022) and the user
 * lands back on the route the guard bounced them from.
 */
export function LoginPage() {
  const { signIn, signInWithGoogle } = useSession();
  const googleAvailable = useGoogleSignInAvailable();
  const navigate = useNavigate();
  const location = useLocation();
  // Return to the guarded origin PRESERVING its query string, so a deep link with
  // params (e.g. /donaciones?organizationId=…&organizationName=… — T-051) comes back
  // with its context intact. Same `state.from` mechanism (RequireAuth), just no longer
  // dropping `search`.
  const origin = (location.state as FromState | null)?.from;
  const from = origin ? `${origin.pathname}${origin.search}` : null;
  // Intención explícita de un enlace público (?returnTo=), validada contra
  // open redirect. Tiene prioridad sobre state.from si llegan ambas.
  const [search] = useSearchParams();
  const target = safeReturnTo(search.get('returnTo')) ?? from;
  const client = useApiClient();
  // Sin una ruta pedida, quien gestiona una organización que aún no puede
  // publicar su portal entra primero a "Mi organización" a completarlo.
  // Al volver a la ruta que pidió, se restaura también su `state` (la donación,
  // la jornada o la oferta ya elegida). Un `returnTo` de enlace público no trae
  // estado: su contexto viaja en la query.
  const originState = origin?.state;
  const intent = intentLabelFor(target);
  const destination = useCallback(async (): Promise<{ to: string; state?: unknown }> => {
    if (target) return { to: target, state: originState };
    return { to: await landingAfterSignIn(client) };
  }, [target, originState, client]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const result = collectErrors({
      email: validateEmail(email),
      // Login only requires a non-empty password (min-length is a register concern).
      password: password.length === 0 ? 'La contraseña es obligatoria.' : undefined,
    });
    setErrors(result.errors);
    setFormError(null);
    if (!result.isValid) {
      (result.errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await signIn({ email, password });
      const next = await destination();
      navigate(next.to, { replace: true, state: next.state });
    } catch (error) {
      setFormError(loginErrorMessage(toApiError(error).status));
      setSubmitting(false);
    }
  };

  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void handleSubmit();
  };

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setFormError(null);
      setSubmitting(true);
      try {
        await signInWithGoogle(idToken);
        const next = await destination();
        navigate(next.to, { replace: true, state: next.state });
      } catch {
        setFormError('No pudimos iniciar sesión con Google. Inténtalo de nuevo.');
        setSubmitting(false);
      }
    },
    [signInWithGoogle, navigate, destination],
  );

  return (
    <AuthLayout
      title="Iniciar sesión"
      description="Ingresa a tu cuenta de AdoptaFácil."
      footer={
        <>
          <p>
            ¿No tienes cuenta?{' '}
            <Link
              to={accessPathWithReturn('/register', target)}
              className="font-medium text-primary hover:underline"
            >
              Regístrate
            </Link>
          </p>
          <p>
            <Link to="/forgot" className="font-medium text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </>
      }
    >
      {formError && <FormAlert>{formError}</FormAlert>}

      {intent && (
        <div
          className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
          data-testid="login-intent"
        >
          <p className="font-medium text-foreground">
            Para {intent}, crea tu cuenta o entra. Es rápido y, después, volverás directo a esta
            acción con lo que ya elegiste.
          </p>
        </div>
      )}

      {googleAvailable && (
        <>
          <GoogleSignInButton onCredential={handleGoogleCredential} disabled={submitting} />
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            o entra con tu correo
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <Field
        ref={emailRef}
        id="login-email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        onKeyDown={onEnter}
        error={errors.email}
        required
      />
      <Field
        ref={passwordRef}
        id="login-password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        onKeyDown={onEnter}
        error={errors.password}
        required
      />

      <Button
        type="button"
        className="w-full"
        onClick={() => void handleSubmit()}
        disabled={submitting}
      >
        {submitting ? 'Ingresando…' : 'Iniciar sesión'}
      </Button>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Al usar AdoptaFácil aplican los{' '}
        <Link to="/legal/terminos" className="underline underline-offset-2">
          Términos
        </Link>{' '}
        y la{' '}
        <Link to="/legal/politica-de-datos" className="underline underline-offset-2">
          Política de datos
        </Link>
        . Si es tu primera vez con Google, te pediremos aceptarlos antes de continuar.
      </p>
    </AuthLayout>
  );
}
