import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  CUSTODY_ID_TYPES,
  CUSTODY_ID_TYPE_LABELS,
  type CustodyIdType,
  type CustodyResponsible,
} from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  friendlyErrorMessage,
} from '@adoptafacil/ui';
import type { CustodyApi } from '../api/custody-api';
import { missingDataOf } from '../model/custody-view';

/** Piezas de formulario de custodia (locales a la feature). */

export const CONTROL_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground';

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 text-sm ${className ?? ''}`}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  maxLength,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      className={CONTROL_CLASS}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: T | '';
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  placeholder?: string;
}) {
  return (
    <select
      className={`${CONTROL_CLASS} h-10`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function CheckField({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

export function FileField({
  label,
  hint,
  accept,
  onChange,
}: {
  label: string;
  hint?: string;
  accept: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="file"
        accept={accept}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </Field>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <p
      className={`rounded-md px-3 py-2 text-xs ${
        tone === 'warning' ? 'bg-amber-50 text-amber-900' : 'bg-muted text-muted-foreground'
      }`}
    >
      {children}
    </p>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-border pt-4">
      <legend className="pr-2 text-sm font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Registro hecho después de los hechos: siempre con su procedencia. */
export function RetrospectiveFields({
  checked,
  source,
  onChecked,
  onSource,
}: {
  checked: boolean;
  source: string;
  onChecked: (checked: boolean) => void;
  onSource: (source: string) => void;
}) {
  return (
    <div className="space-y-2">
      <CheckField checked={checked} onChange={onChecked}>
        Es un registro retrospectivo (lo estoy registrando después de que ocurrió).
      </CheckField>
      {checked && (
        <Field
          label="¿De dónde sale la información?"
          hint="Por ejemplo: contrato en papel del 3 de marzo, o chat con el responsable. El documento lo dirá."
        >
          <Input value={source} maxLength={300} onChange={(e) => onSource(e.target.value)} />
        </Field>
      )}
    </div>
  );
}

/**
 * Diálogo con formulario: valida, envía, muestra el error de la API en
 * palabras y, si faltan datos para generar un documento, dice cuáles.
 */
export function FormDialog({
  open,
  onClose,
  title,
  description,
  submitLabel,
  destructive,
  wide,
  validate,
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  destructive?: boolean;
  wide?: boolean;
  /** Devuelve el mensaje de lo que falta, o `null` si se puede enviar. */
  validate?: () => string | null;
  onSubmit: () => Promise<void>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setError(null);
      setMissing([]);
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // Un diálogo abierto desde otro formulario no debe enviar también el de afuera.
    event.stopPropagation();
    const problem = validate?.() ?? null;
    setMissing([]);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      await onSubmit();
    } catch (cause) {
      const list = missingDataOf(cause);
      setMissing(list);
      setError(
        list.length > 0
          ? 'Falta información para generar el documento:'
          : friendlyErrorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        className={wide ? 'max-h-[90vh] max-w-3xl overflow-y-auto' : 'max-h-[90vh] overflow-y-auto'}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
          {children}
          {error && (
            <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              <p>{error}</p>
              {missing.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className={destructive ? 'bg-red-700 text-white hover:bg-red-800' : undefined}
              disabled={busy}
            >
              {busy ? 'Guardando…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pide un motivo antes de anular o terminar algo. */
export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label = 'Motivo',
  submitLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  label?: string;
  submitLabel: string;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      submitLabel={submitLabel}
      destructive
      validate={() => (reason.trim().length < 5 ? 'Explica el motivo en pocas palabras.' : null)}
      onSubmit={() => onConfirm(reason.trim())}
    >
      <Field label={label}>
        <TextArea value={reason} onChange={setReason} maxLength={300} />
      </Field>
    </FormDialog>
  );
}

const ID_TYPE_OPTIONS = CUSTODY_ID_TYPES.map((value) => ({
  value,
  label: CUSTODY_ID_TYPE_LABELS[value],
}));

/** Alta o edición de un responsable. */
export function ResponsibleDialog({
  api,
  open,
  onClose,
  editing,
  onSaved,
}: {
  api: CustodyApi;
  open: boolean;
  onClose: () => void;
  editing?: CustodyResponsible | null;
  onSaved: (responsible: CustodyResponsible) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [documentType, setDocumentType] = useState<CustodyIdType>('CC');
  const [documentNumber, setDocumentNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    if (!open) return;
    setFullName(editing?.fullName ?? '');
    setDocumentType(editing?.documentType ?? 'CC');
    setDocumentNumber(editing?.documentNumber ?? '');
    setPhone(editing?.phone ?? '');
    setEmail(editing?.email ?? '');
    setAddress(editing?.address ?? '');
    setCity(editing?.city ?? '');
  }, [open, editing]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={editing ? 'Editar responsable' : 'Nuevo responsable'}
      description="La persona que entrega al animal, lo tiene a su cargo o responde por los pagos. Los documentos ya emitidos conservan los datos que tenían."
      submitLabel="Guardar"
      validate={() => {
        if (fullName.trim().length < 2) return 'Escribe el nombre completo.';
        if (documentNumber.trim().length < 3) return 'Escribe el número de documento.';
        return null;
      }}
      onSubmit={async () => {
        const input = {
          fullName: fullName.trim(),
          documentType,
          documentNumber: documentNumber.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
        };
        const saved = editing
          ? await api.updateResponsible(editing.id, input)
          : await api.createResponsible(input);
        onSaved(saved);
      }}
    >
      <Field label="Nombre completo">
        <Input value={fullName} maxLength={160} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo de documento">
          <SelectField value={documentType} onChange={setDocumentType} options={ID_TYPE_OPTIONS} />
        </Field>
        <Field label="Número de documento">
          <Input
            value={documentNumber}
            maxLength={30}
            onChange={(e) => setDocumentNumber(e.target.value)}
          />
        </Field>
        <Field label="Teléfono">
          <Input
            value={phone}
            maxLength={40}
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Correo">
          <Input
            value={email}
            type="email"
            maxLength={200}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Dirección">
          <Input value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Ciudad">
          <Input value={city} maxLength={120} onChange={(e) => setCity(e.target.value)} />
        </Field>
      </div>
    </FormDialog>
  );
}

/** Elegir un responsable ya registrado o crear uno sin salir del formulario. */
export function ResponsiblePicker({
  api,
  value,
  onChange,
  canCreate,
  optional,
}: {
  api: CustodyApi;
  value: string;
  onChange: (id: string) => void;
  canCreate: boolean;
  optional?: boolean;
}) {
  const [list, setList] = useState<CustodyResponsible[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .responsibles()
      .then((rows) => alive && setList(rows))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [api]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <SelectField
          value={value}
          onChange={onChange}
          placeholder={
            optional ? 'Sin responsable (animal encontrado o rescatado)' : 'Elige al responsable'
          }
          options={list.map((r) => ({
            value: r.id,
            label: `${r.fullName} · ${r.documentType} ${r.documentNumber}`,
          }))}
        />
        {canCreate && (
          <Button type="button" variant="outline" onClick={() => setCreating(true)}>
            Nuevo
          </Button>
        )}
      </div>
      <ResponsibleDialog
        api={api}
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(saved) => {
          setList((rows) => [...rows.filter((r) => r.id !== saved.id), saved]);
          onChange(saved.id);
          setCreating(false);
        }}
      />
    </div>
  );
}
