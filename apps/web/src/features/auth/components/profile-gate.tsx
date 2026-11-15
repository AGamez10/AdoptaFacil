import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@adoptafacil/ui';
import { isIncompleteProfileError, missingProfileFields } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { collectErrors, validateRequired } from '../validation';
import { Field } from './field';
import { FormAlert } from './form-alert';

type ProfileField = 'phone' | 'documentId' | 'address';
const ALL_FIELDS: readonly ProfileField[] = ['phone', 'documentId', 'address'];

const LABELS: Record<ProfileField, { label: string; required: string; autoComplete: string }> = {
  phone: { label: 'Teléfono de contacto', required: 'El teléfono', autoComplete: 'tel' },
  documentId: {
    label: 'Documento de identidad (cédula)',
    required: 'El documento de identidad',
    autoComplete: 'off',
  },
  address: {
    label: 'Dirección / ciudad de residencia',
    required: 'La dirección',
    autoComplete: 'street-address',
  },
};

/** The person closed the "faltan datos" window without saving: nothing was sent. */
export class ProfileGateCancelled extends Error {
  constructor() {
    super('Profile completion cancelled');
    this.name = 'ProfileGateCancelled';
  }
}

export function isProfileGateCancelled(error: unknown): error is ProfileGateCancelled {
  return error instanceof ProfileGateCancelled;
}

export interface ProfileFieldsFormProps {
  /** Only these fields are asked (the ones the API said are missing). */
  fields?: readonly ProfileField[];
  submitLabel?: string;
  onSaved: () => void | Promise<void>;
}

/** Teléfono, documento y dirección: lo que piden donar, adoptar o inscribirse. */
export function ProfileFieldsForm({
  fields = ALL_FIELDS,
  submitLabel = 'Guardar perfil',
  onSaved,
}: ProfileFieldsFormProps) {
  const { user, completeProfile } = useSession();
  const [values, setValues] = useState<Record<ProfileField, string>>({
    phone: user?.phone ?? '',
    documentId: user?.documentId ?? '',
    address: user?.address ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const refs = {
    phone: useRef<HTMLInputElement>(null),
    documentId: useRef<HTMLInputElement>(null),
    address: useRef<HTMLInputElement>(null),
  };
  const shown = fields.length > 0 ? fields : ALL_FIELDS;

  const submit = async () => {
    const result = collectErrors(
      Object.fromEntries(
        shown.map((field) => [field, validateRequired(values[field], LABELS[field].required)]),
      ) as Partial<Record<ProfileField, string | undefined>>,
    );
    setErrors(result.errors);
    setFormError(null);
    if (!result.isValid) {
      const first = shown.find((field) => result.errors[field]);
      if (first) refs[first].current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await completeProfile(
        Object.fromEntries(shown.map((field) => [field, values[field].trim()])) as Partial<
          Record<ProfileField, string>
        >,
      );
    } catch {
      setFormError('No pudimos guardar tus datos. Inténtalo de nuevo.');
      setSubmitting(false);
      return;
    }
    try {
      await onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      {shown.map((field) => (
        <Field
          key={field}
          ref={refs[field]}
          id={`profile-${field}`}
          label={LABELS[field].label}
          type={field === 'phone' ? 'tel' : 'text'}
          autoComplete={LABELS[field].autoComplete}
          value={values[field]}
          onChange={(value) => setValues((prev) => ({ ...prev, [field]: value }))}
          error={errors[field]}
          required
        />
      ))}
      <Button type="button" className="w-full" onClick={() => void submit()} disabled={submitting}>
        {submitting ? 'Guardando…' : submitLabel}
      </Button>
    </div>
  );
}

interface Pending {
  reason: string;
  fields: readonly ProfileField[];
  retry: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

/**
 * Pide los datos que faltan SIN sacar a la persona de lo que está haciendo.
 *
 * `run(action)` ejecuta la acción (donar, solicitar adopción, inscribirse). Si
 * la API responde 422 `INCOMPLETE_PROFILE`, abre una ventana con solo los
 * campos que faltan; al guardarlos, repite la MISMA acción con lo que ya había
 * elegido y la promesa termina con su resultado, como si no hubiera pasado
 * nada. Si la persona cierra la ventana, rechaza con `ProfileGateCancelled`.
 * Render `dialog` once in the page.
 */
export function useProfileGate() {
  const [pending, setPending] = useState<Pending | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>, reason: string): Promise<T> => {
    try {
      return await action();
    } catch (error) {
      if (!isIncompleteProfileError(error)) throw error;
      const missing = missingProfileFields(error).filter((f): f is ProfileField =>
        (ALL_FIELDS as readonly string[]).includes(f),
      );
      return new Promise<T>((resolve, reject) => {
        setPending({
          reason,
          fields: missing.length > 0 ? missing : ALL_FIELDS,
          retry: action,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
      });
    }
  }, []);

  const close = () => {
    pending?.reject(new ProfileGateCancelled());
    setPending(null);
  };

  const onSaved = async () => {
    if (!pending) return;
    const current = pending;
    setPending(null);
    try {
      current.resolve(await current.retry());
    } catch (error) {
      current.reject(error);
    }
  };

  const dialog: ReactNode = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent data-testid="profile-gate">
        <DialogHeader>
          <DialogTitle>Un último paso</DialogTitle>
          <DialogDescription>
            {pending?.reason} Al guardar seguimos con tu solicitud, sin que pierdas lo que ya
            elegiste.
          </DialogDescription>
        </DialogHeader>
        {pending && (
          <ProfileFieldsForm
            fields={pending.fields}
            submitLabel="Guardar y continuar"
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );

  return { run, dialog };
}
