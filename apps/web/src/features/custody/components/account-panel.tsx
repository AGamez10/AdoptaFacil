import { useEffect, useState } from 'react';
import {
  CUSTODY_CHARGE_CONCEPTS,
  CUSTODY_CHARGE_CONCEPT_LABELS,
  CUSTODY_CHARGE_SITUATION_LABELS,
  CUSTODY_DEBT_SEPARATION_NOTICE,
  CUSTODY_MANUAL_PAYMENT_METHODS,
  CUSTODY_PAYMENT_METHOD_LABELS,
  CUSTODY_RECEIPT_NOTICE,
  type CustodyCharge,
  type CustodyChargeConcept,
  type CustodyManualPaymentMethod,
  type CustodyPayment,
  type CustodyPaymentLink,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  buttonVariants,
  friendlyErrorMessage,
  useToast,
} from '@adoptafacil/ui';
import { openBlob, type CustodyApi } from '../api/custody-api';
import {
  FILE_ACCEPT,
  SITUATION_TONE,
  formatCop,
  formatDate,
  parseCopInput,
  paymentLinkMessage,
  todayInColombia,
  whatsappShareUrl,
} from '../model/custody-view';
import {
  CheckField,
  Field,
  FileField,
  FormDialog,
  Notice,
  ReasonDialog,
  ResponsiblePicker,
  SelectField,
  TextArea,
} from './form-kit';

const CONCEPT_OPTIONS = CUSTODY_CHARGE_CONCEPTS.map((value) => ({
  value,
  label: CUSTODY_CHARGE_CONCEPT_LABELS[value],
}));
const METHOD_OPTIONS = CUSTODY_MANUAL_PAYMENT_METHODS.map((value) => ({
  value,
  label: CUSTODY_PAYMENT_METHOD_LABELS[value],
}));

/** Registrar un cobro: mensualidad, alimentación o un gasto adicional. */
export function ChargeDialog({
  api,
  open,
  onClose,
  onDone,
  animalId,
  animalName,
  defaultResponsibleId,
  contractId,
}: {
  api: CustodyApi;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  animalId: string;
  animalName: string;
  defaultResponsibleId?: string;
  contractId?: string;
}) {
  const [concept, setConcept] = useState<CustodyChargeConcept | ''>('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayInColombia());
  const [expenseDate, setExpenseDate] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setConcept('');
    setDescription('');
    setAmount('');
    setDueDate(todayInColombia());
    setExpenseDate('');
    setPeriodLabel('');
    setResponsibleId(defaultResponsibleId ?? '');
    setFile(null);
  }, [open, defaultResponsibleId]);

  const isExpense = concept !== '' && concept !== 'boarding_fee';

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`Registrar un cobro de ${animalName}`}
      description="Un valor que el responsable debe pagar. No es una donación y no aparece en el libro de donaciones."
      submitLabel="Registrar cobro"
      validate={() => {
        if (!concept) return 'Elige el concepto.';
        if (description.trim().length < 3) return 'Describe el cobro en pocas palabras.';
        if (!parseCopInput(amount)) return 'Escribe el valor en pesos, por ejemplo 350000.';
        if (!dueDate) return 'Indica la fecha de vencimiento.';
        if (!responsibleId) return 'Elige al responsable del pago.';
        return null;
      }}
      onSubmit={async () => {
        await api.createCharge(
          {
            animalId,
            responsibleId,
            contractId,
            concept: concept as CustodyChargeConcept,
            description: description.trim(),
            amountCop: parseCopInput(amount) ?? 0,
            dueDate,
            expenseDate: expenseDate || undefined,
            periodLabel: periodLabel.trim() || undefined,
          },
          file,
        );
        onDone('Cobro registrado en la cuenta del responsable.');
      }}
    >
      <Field label="Responsable del pago">
        <ResponsiblePicker api={api} value={responsibleId} onChange={setResponsibleId} canCreate />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Concepto">
          <SelectField
            value={concept}
            onChange={setConcept}
            options={CONCEPT_OPTIONS}
            placeholder="Elige el concepto"
          />
        </Field>
        <Field label="Valor (COP)">
          <Input
            inputMode="numeric"
            placeholder="350.000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Descripción">
        <Input
          value={description}
          maxLength={300}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha de vencimiento">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        {isExpense ? (
          <Field label="Fecha del gasto (opcional)">
            <Input
              type="date"
              value={expenseDate}
              max={todayInColombia()}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </Field>
        ) : (
          <Field label="Periodo (opcional)" hint="Por ejemplo: noviembre de 2026.">
            <Input
              value={periodLabel}
              maxLength={60}
              onChange={(e) => setPeriodLabel(e.target.value)}
            />
          </Field>
        )}
      </div>
      <FileField
        label="Soporte (opcional)"
        hint="Factura o recibo del gasto. PDF o imagen."
        accept={FILE_ACCEPT}
        onChange={setFile}
      />
      <Notice>
        Un cobro no se edita: si hay un error, se anula con su motivo y se registra de nuevo.
      </Notice>
    </FormDialog>
  );
}

function PaymentDialog({
  api,
  charge,
  onClose,
  onDone,
}: {
  api: CustodyApi;
  charge: CustodyCharge | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(todayInColombia());
  const [method, setMethod] = useState<CustodyManualPaymentMethod | ''>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!charge) return;
    setAmount(String(charge.balanceCop));
    setPaidOn(todayInColombia());
    setMethod('');
    setReference('');
    setNotes('');
    setFile(null);
  }, [charge]);

  return (
    <FormDialog
      open={charge !== null}
      onClose={onClose}
      title="Registrar un pago"
      description={
        charge ? `${charge.description} · saldo ${formatCop(charge.balanceCop)}` : undefined
      }
      submitLabel="Registrar pago y generar constancia"
      validate={() => {
        const value = parseCopInput(amount);
        if (!value) return 'Escribe el valor recibido en pesos.';
        if (charge && value > charge.balanceCop)
          return `El valor supera el saldo del cobro (${formatCop(charge.balanceCop)}).`;
        if (!method) return 'Elige el medio de pago.';
        return null;
      }}
      onSubmit={async () => {
        if (!charge) return;
        await api.registerPayment(
          charge.id,
          {
            amountCop: parseCopInput(amount) ?? 0,
            paidOn,
            method: method as CustodyManualPaymentMethod,
            reference: reference.trim() || undefined,
            notes: notes.trim() || undefined,
          },
          file,
        );
        onDone('Pago registrado. La constancia quedó en los documentos.');
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valor recibido (COP)">
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Fecha del pago">
          <Input
            type="date"
            value={paidOn}
            max={todayInColombia()}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </Field>
        <Field label="Medio de pago">
          <SelectField
            value={method}
            onChange={setMethod}
            options={METHOD_OPTIONS}
            placeholder="Elige el medio"
          />
        </Field>
        <Field label="Referencia (opcional)">
          <Input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
      <FileField
        label="Comprobante bancario (opcional)"
        hint="PDF o imagen de la transferencia o consignación."
        accept={FILE_ACCEPT}
        onChange={setFile}
      />
      <Field label="Notas (opcional)">
        <Input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Notice>{CUSTODY_RECEIPT_NOTICE}</Notice>
    </FormDialog>
  );
}

function ExtensionDialog({
  api,
  charge,
  onClose,
  onDone,
}: {
  api: CustodyApi;
  charge: CustodyCharge | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [newDueDate, setNewDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [requestedBy, setRequestedBy] = useState('');

  useEffect(() => {
    if (!charge) return;
    setNewDueDate('');
    setReason('');
    setRequestedBy(charge.responsibleName);
  }, [charge]);

  return (
    <FormDialog
      open={charge !== null}
      onClose={onClose}
      title="Conceder una prórroga"
      description={
        charge
          ? `${charge.description} · la fecha que rige hoy es el ${formatDate(charge.effectiveDueDate)}`
          : undefined
      }
      submitLabel="Conceder prórroga"
      validate={() => {
        if (!newDueDate) return 'Indica la nueva fecha de compromiso.';
        if (charge && newDueDate <= charge.effectiveDueDate)
          return 'La nueva fecha debe ser posterior a la que rige hoy.';
        if (newDueDate < todayInColombia()) return 'La nueva fecha no puede estar en el pasado.';
        if (reason.trim().length < 5) return 'Explica el motivo de la prórroga.';
        return null;
      }}
      onSubmit={async () => {
        if (!charge) return;
        await api.grantExtension(charge.id, {
          newDueDate,
          reason: reason.trim(),
          requestedBy: requestedBy.trim() || undefined,
        });
        onDone('Prórroga concedida. El registro quedó en los documentos.');
      }}
    >
      <Notice>
        La prórroga es una decisión de la organización y queda a tu nombre. La fecha de vencimiento
        original del cobro no cambia: se fija una nueva fecha de compromiso.
      </Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nueva fecha de compromiso">
          <Input
            type="date"
            value={newDueDate}
            min={todayInColombia()}
            onChange={(e) => setNewDueDate(e.target.value)}
          />
        </Field>
        <Field label="Quién la solicita (opcional)">
          <Input
            value={requestedBy}
            maxLength={160}
            onChange={(e) => setRequestedBy(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Motivo">
        <TextArea value={reason} onChange={setReason} maxLength={300} />
      </Field>
    </FormDialog>
  );
}

function CollectionDialog({
  api,
  charge,
  onClose,
  onDone,
}: {
  api: CustodyApi;
  charge: CustodyCharge | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [note, setNote] = useState('');
  const [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    if (!charge) return;
    setNote('');
    setReviewed(false);
  }, [charge]);

  return (
    <FormDialog
      open={charge !== null}
      onClose={onClose}
      title="Iniciar el procedimiento de cobro"
      description={
        charge ? `${charge.description} · saldo ${formatCop(charge.balanceCop)}` : undefined
      }
      submitLabel="Dejar constancia"
      validate={() => {
        if (note.trim().length < 5) return 'Escribe qué se decidió y por qué.';
        if (!reviewed) return 'Confirma que revisaste el caso antes de continuar.';
        return null;
      }}
      onSubmit={async () => {
        if (!charge) return;
        await api.startCollection(charge.id, note.trim());
        onDone('Quedó constancia del inicio del procedimiento de cobro.');
      }}
    >
      <Notice tone="warning">
        Esto solo deja constancia de una decisión tomada por una persona. No retiene al animal, no
        cambia su custodia y no lo entrega a nadie. {CUSTODY_DEBT_SEPARATION_NOTICE}
      </Notice>
      <Field label="Qué se decidió">
        <TextArea value={note} onChange={setNote} maxLength={3000} />
      </Field>
      <CheckField checked={reviewed} onChange={setReviewed}>
        Revisé el caso (avisos enviados, respuesta del responsable, prórrogas) y decido iniciar el
        procedimiento de cobro.
      </CheckField>
    </FormDialog>
  );
}

function isLate(charge: CustodyCharge): boolean {
  return (
    charge.status === 'pending' &&
    (charge.situation === 'overdue' || charge.situation === 'extension_breached')
  );
}

/**
 * Lista de cobros con sus pagos, prórrogas y acciones. Se usa en la pestaña
 * del animal y en la página de custodia.
 */
export function ChargeList({
  api,
  charges,
  canWrite,
  canManage,
  showAnimal,
  onlinePayments,
  onChanged,
}: {
  api: CustodyApi;
  charges: CustodyCharge[];
  canWrite: boolean;
  canManage: boolean;
  showAnimal?: boolean;
  /** La organización tiene encendido el pago en línea: se ofrece el enlace de pago. */
  onlinePayments?: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [paying, setPaying] = useState<CustodyCharge | null>(null);
  const [extending, setExtending] = useState<CustodyCharge | null>(null);
  const [collecting, setCollecting] = useState<CustodyCharge | null>(null);
  const [cancelling, setCancelling] = useState<CustodyCharge | null>(null);
  const [voiding, setVoiding] = useState<CustodyPayment | null>(null);
  const [link, setLink] = useState<CustodyPaymentLink | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const showLink = async (charge: CustodyCharge) => {
    setLinkBusy(charge.id);
    try {
      setLink(await api.paymentLink(charge.id));
      // La primera vez se crea: la lista se refresca para mostrar "Enlace activo".
      if (!charge.paymentLinkActive) onChanged();
    } catch (error) {
      toast({
        title: 'No pudimos crear el enlace de pago',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setLinkBusy(null);
    }
  };

  const copyText = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: done, variant: 'success' });
    } catch {
      toast({ title: 'Selecciona el enlace y cópialo a mano.', variant: 'destructive' });
    }
  };

  const nativeShare = async (charge: CustodyCharge, url: string) => {
    try {
      await navigator.share({
        title: `Pago de ${charge.description}`,
        text: paymentLinkMessage(charge, url),
      });
    } catch {
      // La persona cerró el panel de compartir: no es un error.
    }
  };

  const revokeLink = async () => {
    if (!link) return;
    setRevoking(true);
    try {
      await api.revokePaymentLink(link.chargeId);
      setLink(null);
      toast({
        title: 'El enlace quedó sin efecto.',
        description: 'Quien lo tenga ya no puede pagar con él. Puedes crear uno nuevo.',
        variant: 'success',
      });
      onChanged();
    } catch (error) {
      toast({
        title: 'No pudimos dejar sin efecto el enlace',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setRevoking(false);
    }
  };

  const done = (message: string) => {
    setPaying(null);
    setExtending(null);
    setCollecting(null);
    setCancelling(null);
    setVoiding(null);
    toast({ title: message, variant: 'success' });
    onChanged();
  };

  const openDocument = async (id: string | undefined) => {
    if (!id) return;
    try {
      openBlob(await api.documentBlob(id));
    } catch (error) {
      toast({
        title: 'No pudimos abrir el documento',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  if (charges.length === 0) {
    return (
      <EmptyState
        title="No hay cobros registrados"
        description={
          onlinePayments
            ? 'Aquí aparecerán las mensualidades, la alimentación y los gastos adicionales a cargo del responsable. Cada cobro pendiente trae su botón "Enlace de pago" para compartirlo.'
            : 'Aquí aparecerán las mensualidades, la alimentación y los gastos adicionales a cargo del responsable.'
        }
      />
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {charges.map((charge) => (
          <li key={charge.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{charge.description}</span>
                  <Badge variant={SITUATION_TONE[charge.situation]}>
                    {CUSTODY_CHARGE_SITUATION_LABELS[charge.situation]}
                    {charge.daysOverdue > 0 ? ` · ${charge.daysOverdue} días` : ''}
                  </Badge>
                  {charge.collectionStartedAt && <Badge variant="outline">Cobro iniciado</Badge>}
                  {charge.status === 'pending' && onlinePayments && charge.paymentLinkActive && (
                    <Badge variant="info">Enlace de pago activo</Badge>
                  )}
                  {(charge.onlinePaymentsInReview ?? 0) > 0 && (
                    <Badge variant="warning">Pago en línea por revisar</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {CUSTODY_CHARGE_CONCEPT_LABELS[charge.concept]}
                  {showAnimal ? ` · ${charge.animalName}` : ''} · {charge.responsibleName}
                  {charge.contractNumber ? ` · contrato ${charge.contractNumber}` : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  Vence el {formatDate(charge.dueDate)}
                  {charge.effectiveDueDate !== charge.dueDate
                    ? ` · prórroga hasta el ${formatDate(charge.effectiveDueDate)}`
                    : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold">{formatCop(charge.amountCop)}</p>
                {charge.status === 'pending' && charge.paidCop > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Saldo {formatCop(charge.balanceCop)}
                  </p>
                )}
              </div>
            </div>

            {charge.cancelReason && (
              <p className="mt-2 text-sm text-muted-foreground">Anulado: {charge.cancelReason}</p>
            )}

            {(charge.payments.length > 0 || charge.extensions.length > 0) && (
              <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                {charge.extensions.map((extension) => (
                  <li key={extension.id} className="text-muted-foreground">
                    Prórroga hasta el {formatDate(extension.newDueDate)} · autorizó{' '}
                    {extension.authorizedByName} · {extension.reason}
                  </li>
                ))}
                {charge.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={payment.voidedAt ? 'text-muted-foreground line-through' : ''}>
                      Pago de {formatCop(payment.amountCop)} el {formatDate(payment.paidOn)} ·{' '}
                      {CUSTODY_PAYMENT_METHOD_LABELS[payment.method]} · constancia{' '}
                      {payment.receiptNumber}
                    </span>
                    {payment.voidedAt && (
                      <span className="text-muted-foreground">Anulado: {payment.voidReason}</span>
                    )}
                    {payment.receiptDocumentId && (
                      <button
                        type="button"
                        className="underline underline-offset-4"
                        onClick={() => void openDocument(payment.receiptDocumentId)}
                      >
                        Ver constancia
                      </button>
                    )}
                    {payment.proofDocumentId && (
                      <button
                        type="button"
                        className="underline underline-offset-4"
                        onClick={() => void openDocument(payment.proofDocumentId)}
                      >
                        Ver comprobante
                      </button>
                    )}
                    {canManage && !payment.voidedAt && (
                      <button
                        type="button"
                        className="text-destructive underline underline-offset-4"
                        onClick={() => setVoiding(payment)}
                      >
                        Anular pago
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {charge.supportDocumentId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void openDocument(charge.supportDocumentId)}
                >
                  Ver soporte
                </Button>
              )}
              {charge.status === 'pending' && canWrite && (
                <Button size="sm" onClick={() => setPaying(charge)}>
                  Registrar pago
                </Button>
              )}
              {charge.status === 'pending' && canWrite && onlinePayments && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={linkBusy === charge.id}
                  onClick={() => void showLink(charge)}
                >
                  {linkBusy === charge.id
                    ? 'Preparando enlace…'
                    : charge.paymentLinkActive
                      ? 'Ver enlace de pago'
                      : 'Enlace de pago'}
                </Button>
              )}
              {charge.status === 'pending' && canManage && (
                <Button size="sm" variant="outline" onClick={() => setExtending(charge)}>
                  Conceder prórroga
                </Button>
              )}
              {canManage && isLate(charge) && !charge.collectionStartedAt && (
                <Button size="sm" variant="outline" onClick={() => setCollecting(charge)}>
                  Iniciar cobro
                </Button>
              )}
              {canManage && charge.status !== 'cancelled' && charge.paidCop === 0 && (
                <Button size="sm" variant="ghost" onClick={() => setCancelling(charge)}>
                  Anular cobro
                </Button>
              )}
            </div>

            {(charge.onlinePaymentsInReview ?? 0) > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Llegó un pago en línea que este cobro ya no admitía (estaba pagado o anulado). El
                dinero está en la cuenta de Mercado Pago de la organización: revísalo en el
                historial del animal y devuelve lo que sobre desde Mercado Pago.
              </p>
            )}

            {link?.chargeId === charge.id && (
              <div
                className="mt-3 space-y-2 rounded-md bg-muted p-3 text-sm"
                role="region"
                aria-label="Enlace de pago por Mercado Pago"
              >
                <p className="font-medium">Enlace de pago por Mercado Pago</p>
                <p className="text-muted-foreground">
                  Envíaselo a {charge.responsibleName} por WhatsApp, correo o como prefieras. No
                  necesita cuenta en AdoptaFácil, puede pagar todo el saldo o una parte y el dinero
                  llega a la cuenta de Mercado Pago de la organización. El pago queda registrado
                  solo, con su constancia. Es el mismo enlace cada vez que lo abras aquí.
                </p>
                <Input
                  readOnly
                  aria-label="Enlace de pago"
                  value={link.url}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      void copyText(link.url, 'Enlace copiado. Compártelo con quien va a pagar.')
                    }
                  >
                    Copiar enlace
                  </Button>
                  <a
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    href={whatsappShareUrl(paymentLinkMessage(charge, link.url))}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Enviar por WhatsApp
                  </a>
                  {canNativeShare ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void nativeShare(charge, link.url)}
                    >
                      Compartir
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void copyText(
                          paymentLinkMessage(charge, link.url),
                          'Mensaje copiado con el enlace. Pégalo donde quieras enviarlo.',
                        )
                      }
                    >
                      Copiar mensaje
                    </Button>
                  )}
                  <a
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver como quien paga
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revoking}
                    onClick={() => void revokeLink()}
                  >
                    Dejar sin efecto
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLink(null)}>
                    Cerrar
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <PaymentDialog api={api} charge={paying} onClose={() => setPaying(null)} onDone={done} />
      <ExtensionDialog
        api={api}
        charge={extending}
        onClose={() => setExtending(null)}
        onDone={done}
      />
      <CollectionDialog
        api={api}
        charge={collecting}
        onClose={() => setCollecting(null)}
        onDone={done}
      />
      <ReasonDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Anular el cobro"
        description="El cobro sigue visible como anulado, con tu explicación."
        submitLabel="Anular cobro"
        onConfirm={async (reason) => {
          if (!cancelling) return;
          await api.cancelCharge(cancelling.id, reason);
          done('Cobro anulado.');
        }}
      />
      <ReasonDialog
        open={voiding !== null}
        onClose={() => setVoiding(null)}
        title="Anular el pago"
        description={
          voiding?.method === 'mercadopago'
            ? 'Este pago entró en línea por Mercado Pago. Anularlo aquí NO devuelve el dinero: la devolución se hace desde la cuenta de Mercado Pago de la organización (si la haces allá, AdoptaFácil la registra sola). La constancia se conserva en el historial y el pago queda marcado como anulado.'
            : 'La constancia ya emitida se conserva en el historial y el pago queda marcado como anulado.'
        }
        submitLabel="Anular pago"
        onConfirm={async (reason) => {
          if (!voiding) return;
          await api.voidPayment(voiding.id, reason);
          done('Pago anulado.');
        }}
      />
    </>
  );
}
