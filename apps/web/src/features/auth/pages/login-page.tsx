import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useSearchParams, type Location } from 'react-router-dom';
import { Button } from '@adoptafacil/ui';
import { toApiError } from '../../../shell/api';
import { accessPathWithReturn, safeReturnTo, useSession } from '../../../shell/auth';
import { AuthLayout } from '../components/auth-layout';
import { Field } from '../components/field';
import { FormAlert } from '../components/form-alert';
import { GoogleSignInButton, useGoogleSignInAvailable } from '../components/google-sign-in-button';
import { useAfterSignIn } from '../lib/use-after-sign-in';
import { collectErrors, loginErrorMessage, validateEmail } from '../validation';

interface FromState {
  from?: Location;
}

/**
 * Login screen (replaces the T-021 stub). Controlled inputs, no native form
 * submit. On success the session is stored via useSession (T-022) and the user
 * lands back on the route the guard bounced them from.
 */
export function LoginPage() {
  const { signIn, signInWithGoogle } = useSession();
  const googleAvailable = useGoogleSignInAvailable();
  const location = useLocation();
  // Return to the guarded origin PRESERVING its query string, so a deep link with
  // params (e.g. /donaciones?organizationId=…&organizationName=… — T-051) comes back
  // with its context intact, and its `state` (the donation, the volunteering day
  // or the offer already chosen).
  const origin = (location.state as FromState | null)?.from;
  const from = origin ? `${origin.pathname}${origin.search}` : null;
  // Intención explícita de un enlace público (?returnTo=), validada contra
  // open redirect. Tiene prioridad sobre state.from si llegan ambas.
  const [search] = useSearchParams();
  const target = safeReturnTo(search.get('returnTo')) ?? from;
  // Sin ruta en la URL, la intención guardada en esta pestaña (p. ej. tras
  // recargar o venir de "Crear cuenta"). Sin ninguna, el inicio de su cuenta.
  const {
    finish,
    intentPath,
    intentLabel: intent,
  } = useAfterSignIn({
    target,
    targetState: target === from ? origin?.state : undefined,
  });

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
      await finish();
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
        const result = await signInWithGoogle(idToken);
        await finish({ isNewAccount: result?.isNewAccount === true });
      } catch {
        setFormError('No pudimos iniciar sesión con Google. Inténtalo de nuevo.');
        setSubmitting(false);
      }
    },
    [signInWithGoogle, finish],
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
              to={accessPathWithReturn('/register', intentPath)}
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
