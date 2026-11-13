import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@adoptafacil/ui';
import type { AccountType } from '../../../shell/api';
import { accessPathWithReturn, safeReturnTo, useSession } from '../../../shell/auth';
import { useAfterSignIn } from '../lib/use-after-sign-in';
import { templateDemoHref, templateName } from '../../portals/templates/demo/demo-templates';
import { AuthLayout } from '../components/auth-layout';
import { FormAlert } from '../components/form-alert';
import { GoogleSignInButton, useGoogleSignInAvailable } from '../components/google-sign-in-button';
import { readSignupTemplate } from '../lib/signup-template';
import { RegisterOrganizationForm } from './register-organization-form';
import { RegisterPersonForm } from './register-person-form';

/**
 * Registration screen. A clear account-type selector (§13) keeps the two flows
 * separate: each tab renders its own distinct form — Organization and Person
 * fields are never mixed. Tab state is in memory only (no browser storage).
 *
 * "Continuar con Google" goes FIRST, above both tabs: it is the shortest way
 * in and it always creates (or enters) a PERSONAL account — never an
 * Organization, which keeps the long NIT/legal-representative form. Legal
 * acceptance and any missing profile data (phone, document, address) are
 * asked AFTER the session exists: the legal gate on entering, and the
 * profile form only when an action needs them.
 */
export function RegisterPage() {
  const [search] = useSearchParams();
  // Plantilla elegida en la vista de ejemplo: queda como la del portal nuevo.
  const template = useMemo(() => readSignupTemplate(search), [search]);
  // Adónde volver después de crear la cuenta (validado contra open redirect).
  const returnTo = safeReturnTo(search.get('returnTo'));
  // La intención sobrevive a recargas y a ir y volver desde "Iniciar sesión".
  const { finish, intentPath, intentLabel } = useAfterSignIn({ target: returnTo });
  // Quien llega desde una acción (donar, jornada, oferta) es una persona: abre
  // esa pestaña. Sin intención, la pestaña de organización sigue primero.
  const [accountType, setAccountType] = useState<AccountType>(
    intentLabel && !template ? 'person' : 'organization',
  );
  const { signInWithGoogle } = useSession();
  const googleAvailable = useGoogleSignInAvailable();
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      setGoogleError(null);
      setGoogleBusy(true);
      try {
        // Same endpoint as login: enters the existing account with that email,
        // or creates the lightweight Person account the first time.
        const result = await signInWithGoogle(idToken);
        await finish({ isNewAccount: result?.isNewAccount === true });
      } catch {
        setGoogleError('No pudimos continuar con Google. Inténtalo de nuevo.');
        setGoogleBusy(false);
      }
    },
    [signInWithGoogle, finish],
  );

  return (
    <AuthLayout
      wide
      title="Crear cuenta"
      description="Elige el tipo de cuenta y completa tus datos."
      footer={
        <p>
          ¿Ya tienes cuenta?{' '}
          <Link
            to={accessPathWithReturn('/login', intentPath)}
            className="font-medium text-primary hover:underline"
          >
            Inicia sesión
          </Link>
        </p>
      }
    >
      {intentLabel && (
        <p
          className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-foreground"
          data-testid="register-intent"
        >
          Para {intentLabel}, crea tu cuenta. Al terminar volverás directo a esa acción con lo que
          ya elegiste.
        </p>
      )}
      {googleError && <FormAlert>{googleError}</FormAlert>}
      {googleAvailable && (
        <div className="mb-5" data-testid="register-google">
          <GoogleSignInButton
            onCredential={handleGoogleCredential}
            disabled={googleBusy}
            text="signup_with"
          />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Crea tu cuenta personal en un paso y confirmamos tu correo. Los términos y los datos que
            falten te los pediremos después, solo cuando hagan falta.
          </p>
          <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />o crea tu cuenta con tus datos
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}
      <Tabs value={accountType} onValueChange={(value) => setAccountType(value as AccountType)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="organization">Organización</TabsTrigger>
          <TabsTrigger value="person">Persona</TabsTrigger>
        </TabsList>
        <TabsContent value="organization" className="mt-4">
          {template && (
            <p
              className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground"
              data-testid="register-template-note"
            >
              Tu portal empezará con la plantilla <strong>{templateName(template)}</strong>. Podrás
              cambiarla cuando quieras.{' '}
              <Link
                to={templateDemoHref(template)}
                className="font-medium text-primary hover:underline"
              >
                Verla de nuevo
              </Link>
            </p>
          )}
          <RegisterOrganizationForm template={template} returnTo={returnTo} />
        </TabsContent>
        <TabsContent value="person" className="mt-4">
          <RegisterPersonForm onRegistered={() => finish({ isNewAccount: true })} />
        </TabsContent>
      </Tabs>
    </AuthLayout>
  );
}
