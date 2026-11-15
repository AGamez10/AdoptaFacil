import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type InvitationPreview, invitationRoleCopy, PLATFORM_ROLES } from '@adoptafacil/contracts';
import { Button, useToast } from '@adoptafacil/ui';
import { toApiError, useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import {
  acceptancesFrom,
  type ConsentState,
  LegalConsentFields,
  requiredConsentsGiven,
} from '../../legal';
import { landingAfterSignIn } from '../../org/lib/portal-readiness';
import { AuthLayout } from '../components/auth-layout';
import { Field } from '../components/field';
import { FormAlert } from '../components/form-alert';
import { GoogleSignInButton, useGoogleSignInAvailable } from '../components/google-sign-in-button';
import { PasswordRequirements } from '../components/password-requirements';
import {
  collectErrors,
  validatePassword,
  validatePasswordConfirmation,
  validateRequired,
} from '../validation';

/** El token viaja en el fragmento (`#token=…`): nunca llega a un servidor. */
export function tokenFromHash(hash: string): string {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return value?.trim() ?? '';
}

const DATE_CO = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

type Errors = Partial<Record<'displayName' | 'password' | 'confirm', string>>;

/**
 * Pantalla del enlace de invitación (`{WEB_BASE_URL}/invitacion#token=…`). Lee
 * el token del fragmento y lo quita de la barra de direcciones, muestra qué
 * organización invita y con qué cargo (lo mismo que dijo el correo), y crea la
 * cuenta con nombre, contraseña y la autorización de datos (Ley 1581). Al
 * terminar la sesión queda abierta, igual que después de registrarse.
 */
export function AcceptInvitationPage() {
  const client = useApiClient();
  const { acceptInvitation, acceptInvitationWithGoogle, isAuthenticated, signOut } = useSession();
  const googleAvailable = useGoogleSignInAvailable() && Boolean(acceptInvitationWithGoogle);
  // Credencial de Google recibida antes de marcar las casillas legales: se
  // guarda en memoria (dura ~1 h) y se envía en cuanto la persona las marque.
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const legalRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [token] = useState(() => tokenFromHash(window.location.hash));
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>(
    token ? 'loading' : 'invalid',
  );

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consents, setConsents] = useState<ConsentState>({});
  const [errors, setErrors] = useState<Errors>({});
  const [legalError, setLegalError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refs = {
    displayName: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };

  // Sacar el token de la barra de direcciones (historial, capturas de pantalla).
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    client
      .request<InvitationPreview>('/auth/invitations/preview', {
        method: 'POST',
        json: { token },
      })
      .then((preview) => {
        if (cancelled) return;
        setInvitation(preview);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [client, token]);

  const handleSubmit = async () => {
    const result = collectErrors({
      displayName: validateRequired(displayName, 'Tu nombre'),
      password: validatePassword(password),
      confirm: validatePasswordConfirmation(password, confirm),
    });
    setErrors(result.errors);
    setFormError(null);
    if (!result.isValid) {
      const first = (['displayName', 'password', 'confirm'] as const).find(
        (key) => result.errors[key],
      );
      if (first) refs[first].current?.focus();
      return;
    }
    if (!requiredConsentsGiven('organization', consents)) {
      setLegalError(
        'Para crear la cuenta debes aceptar los términos y autorizar el tratamiento de datos.',
      );
      return;
    }
    setLegalError(undefined);
    if (!acceptInvitation) {
      setFormError('Este entorno no puede aceptar invitaciones.');
      return;
    }

    setSubmitting(true);
    try {
      await acceptInvitation({
        token,
        displayName: displayName.trim(),
        password,
        legalAcceptances: acceptancesFrom('organization', consents),
      });
    } catch (error) {
      failWith(error);
      return;
    }
    await welcomeIn();
  };

  const failWith = (error: unknown) => {
    const apiError = toApiError(error);
    setFormError(
      apiError.code === 'INVITATION_EMAIL_MISMATCH'
        ? `Esa cuenta de Google no es ${invitation?.email ?? 'el correo invitado'}. Elige en Google la cuenta de ese correo, o crea la cuenta con contraseña.`
        : apiError.status === 409
          ? 'Este correo ya tiene una cuenta en AdoptaFácil. Inicia sesión o pide a la organización que invite otro correo.'
          : apiError.code === 'LEGAL_VERSION_OUTDATED'
            ? 'Los términos se actualizaron mientras llenabas el formulario. Recarga la página y acéptalos de nuevo.'
            : apiError.status === 401
              ? 'Google no confirmó tu cuenta. Inténtalo de nuevo.'
              : apiError.status === 400
                ? 'Este enlace ya no es válido: caducó, ya se usó o la organización lo retiró. Pide una invitación nueva.'
                : 'No pudimos crear tu cuenta. Intenta de nuevo en unos minutos.',
    );
    setSubmitting(false);
  };

  const welcomeIn = async () => {
    toast({
      title: `Ya eres parte de ${invitation?.organizationName ?? 'tu organización'}`,
      description:
        'Tu cuenta quedó creada. Registramos tu aceptación de los términos y te enviamos una constancia a tu correo.',
    });
    const platform = invitation ? PLATFORM_ROLES.includes(invitation.role) : false;
    navigate(platform ? '/' : await landingAfterSignIn(client), { replace: true });
  };

  const acceptWithGoogle = async (idToken: string) => {
    setFormError(null);
    if (!requiredConsentsGiven('organization', consents)) {
      // La autorización de datos es previa (Ley 1581): Google ya respondió,
      // así que solo falta marcar las casillas y confirmar.
      setGoogleToken(idToken);
      setLegalError('Marca las casillas obligatorias y pulsa «Terminar con Google».');
      legalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setLegalError(undefined);
    if (!acceptInvitationWithGoogle) return;
    setSubmitting(true);
    try {
      await acceptInvitationWithGoogle({
        token,
        idToken,
        legalAcceptances: acceptancesFrom('organization', consents),
      });
    } catch (error) {
      setGoogleToken(null);
      failWith(error);
      return;
    }
    await welcomeIn();
  };

  if (state === 'loading') {
    return (
      <AuthLayout title="Abriendo tu invitación…">
        <FormAlert variant="info">Estamos revisando el enlace.</FormAlert>
      </AuthLayout>
    );
  }

  if (state === 'invalid' || !invitation) {
    return (
      <AuthLayout
        title="Esta invitación ya no sirve"
        description="El enlace caducó, ya se usó, la organización lo retiró o está incompleto."
        footer={
          <p>
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Inicia sesión
            </Link>
          </p>
        }
      >
        <FormAlert>
          Pide a la organización que te envíe una invitación nueva. Cada enlace sirve una sola vez y
          caduca a los 7 días.
        </FormAlert>
      </AuthLayout>
    );
  }

  const copy = invitationRoleCopy(invitation.role, invitation.signerRole);
  const expires = DATE_CO.format(new Date(invitation.expiresAt));

  return (
    <AuthLayout
      wide
      title={`Únete a ${invitation.organizationName}`}
      description={
        <>
          Te invitaron con el cargo de <strong>{copy.label}</strong>. {copy.summary}
        </>
      }
      footer={
        <p>¿No esperabas esta invitación? Cierra esta página: sin crear la cuenta no pasa nada.</p>
      }
    >
      <div className="space-y-4">
        <section
          aria-label="Lo que podrás hacer"
          className="rounded-xl border border-primary/20 bg-primary/5 p-4"
        >
          <p className="mb-2 text-sm font-semibold">Con este cargo podrás:</p>
          <ul className="space-y-1.5 text-sm">
            {copy.duties.map((duty) => (
              <li key={duty} className="flex gap-2">
                <span aria-hidden="true" className="font-bold text-primary">
                  ✓
                </span>
                <span>{duty}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Este enlace caduca el {expires} y sirve una sola vez.
          </p>
        </section>

        {isAuthenticated && (
          <FormAlert variant="info">
            Tienes otra sesión abierta en este navegador.{' '}
            <button type="button" className="font-medium underline" onClick={() => void signOut()}>
              Cerrar sesión
            </button>{' '}
            antes de crear la cuenta nueva.
          </FormAlert>
        )}
        {formError && <FormAlert>{formError}</FormAlert>}

        {googleAvailable && !googleToken && (
          <div data-testid="invite-google">
            <GoogleSignInButton
              onCredential={acceptWithGoogle}
              disabled={submitting || isAuthenticated}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Entra con la cuenta de Google de <strong>{invitation.email}</strong>: sin contraseña
              nueva que recordar.
            </p>
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />o crea una contraseña
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}
        {googleToken && (
          <FormAlert variant="info">
            Google confirmó tu cuenta. Solo falta aceptar los documentos de abajo.
          </FormAlert>
        )}

        <Field
          id="invite-email"
          label="Correo"
          type="email"
          value={invitation.email}
          onChange={() => undefined}
          readOnly
        />
        {!googleToken && (
          <>
            <Field
              ref={refs.displayName}
              id="invite-name"
              label="Tu nombre completo"
              autoComplete="name"
              value={displayName}
              onChange={setDisplayName}
              error={errors.displayName}
              required
            />
            <Field
              ref={refs.password}
              id="invite-password"
              label="Contraseña"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              error={errors.password}
              required
            />
            <PasswordRequirements password={password} />
            <Field
              ref={refs.confirm}
              id="invite-confirm"
              label="Confirmar contraseña"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={setConfirm}
              error={errors.confirm}
              required
            />
          </>
        )}

        <div ref={legalRef}>
          <LegalConsentFields
            audience="organization"
            value={consents}
            onChange={setConsents}
            error={legalError}
            idPrefix="invite"
          />
        </div>

        {googleToken ? (
          <Button
            type="button"
            className="w-full"
            onClick={() => void acceptWithGoogle(googleToken)}
            disabled={submitting || isAuthenticated}
          >
            {submitting ? 'Creando tu cuenta…' : 'Terminar con Google'}
          </Button>
        ) : (
          <Button
            type="button"
            className="w-full"
            onClick={() => void handleSubmit()}
            disabled={submitting || isAuthenticated}
          >
            {submitting ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
