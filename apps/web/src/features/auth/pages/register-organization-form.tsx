import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, useToast } from '@adoptafacil/ui';
import { ApiError, type RegisterOrganizationRequest } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import {
  acceptancesFrom,
  type ConsentState,
  LegalConsentFields,
  requiredConsentsGiven,
} from '../../legal';
import { Field } from '../components/field';
import { FormAlert } from '../components/form-alert';
import { PasswordRequirements } from '../components/password-requirements';
import {
  collectErrors,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
  validateRequired,
} from '../validation';

type OrgErrors = Partial<
  Record<'organizationName' | 'contactName' | 'email' | 'password' | 'confirm', string>
>;

/**
 * Registration form for an ORGANIZATION account (§13). Registration captures
 * only what the backend DTO needs: organization name, the legal contact (sent as
 * the owner user's `displayName`), email and password. The NIT (and phone)
 * belong to the M01 formalization flow (Ola 1), not to account creation.
 */
export function RegisterOrganizationForm() {
  const { register } = useSession();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [organizationName, setOrganizationName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [errors, setErrors] = useState<OrgErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [consents, setConsents] = useState<ConsentState>({});
  const [legalError, setLegalError] = useState<string | undefined>();

  const refs = {
    organizationName: useRef<HTMLInputElement>(null),
    contactName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };

  const handleSubmit = async () => {
    const result = collectErrors({
      organizationName: validateRequired(organizationName, 'El nombre de la organización'),
      contactName: validateRequired(contactName, 'El nombre de contacto'),
      email: validateEmail(email),
      password: validatePassword(password),
      confirm: validatePasswordConfirmation(password, confirm),
    });
    setErrors(result.errors);
    setFormError(null);
    if (!result.isValid) {
      const order = ['organizationName', 'contactName', 'email', 'password', 'confirm'] as const;
      const first = order.find((key) => result.errors[key]);
      if (first) refs[first].current?.focus();
      return;
    }
    // Autorización previa (Ley 1581): sin las casillas obligatorias no se envía
    // ningún dato al servidor.
    if (!requiredConsentsGiven('organization', consents)) {
      setLegalError(
        'Para crear la cuenta debes aceptar los términos y autorizar el tratamiento de datos.',
      );
      return;
    }
    setLegalError(undefined);

    const request: RegisterOrganizationRequest = {
      accountType: 'organization',
      organizationName: organizationName.trim(),
      displayName: contactName.trim(),
      email: email.trim(),
      password,
      legalAcceptances: acceptancesFrom('organization', consents),
    };

    setSubmitting(true);
    try {
      await register(request);
      // Aviso al aceptar: la constancia también llega por correo.
      toast({
        title: 'Cuenta creada',
        description:
          'Registramos tu aceptación de los términos y de la autorización de datos. Te enviamos una constancia a tu correo.',
      });
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(
        // Same real-vs-mock code mismatch as register-person-form.tsx: the
        // real API's 409 has no body `code`, so the client falls back to
        // 'conflict' (STATUS_CODES[409] in `shell/api/http.ts`) — never
        // 'email_taken', which only the mock API ever sent.
        ApiError.is(error) && error.code === 'conflict'
          ? 'Ya existe una cuenta con este correo.'
          : 'No pudimos crear la cuenta. Inténtalo de nuevo.',
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {formError && <FormAlert>{formError}</FormAlert>}

      <Field
        ref={refs.organizationName}
        id="org-name"
        label="Nombre de la organización"
        autoComplete="organization"
        value={organizationName}
        onChange={setOrganizationName}
        error={errors.organizationName}
        required
      />
      <Field
        ref={refs.contactName}
        id="org-contact"
        label="Nombre de contacto"
        autoComplete="name"
        value={contactName}
        onChange={setContactName}
        error={errors.contactName}
        required
      />
      <Field
        ref={refs.email}
        id="org-email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        error={errors.email}
        required
      />
      <Field
        ref={refs.password}
        id="org-password"
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
        id="org-confirm"
        label="Confirmar contraseña"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
        error={errors.confirm}
        required
      />

      <LegalConsentFields
        audience="organization"
        value={consents}
        onChange={setConsents}
        error={legalError}
        idPrefix="org"
      />

      <Button
        type="button"
        className="w-full"
        onClick={() => void handleSubmit()}
        disabled={submitting}
      >
        {submitting ? 'Creando cuenta…' : 'Crear cuenta de organización'}
      </Button>
    </div>
  );
}
