import { useEffect, useState } from 'react';
import {
  CUSTODY_CONTRACT_STATUS_LABELS,
  CUSTODY_ID_TYPES,
  CUSTODY_ID_TYPE_LABELS,
  CUSTODY_PAYMENT_FREQUENCIES,
  CUSTODY_PAYMENT_FREQUENCY_LABELS,
  type CustodyClause,
  type CustodyContract,
  type CustodyContractPrefill,
  type CustodyContractTemplate,
  type CustodyPaymentFrequency,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  friendlyErrorMessage,
  useToast,
} from '@adoptafacil/ui';
import { openBlob, type CustodyApi } from '../api/custody-api';
import {
  CONTRACT_STATUS_TONE,
  formatCop,
  formatDate,
  missingDataOf,
  parseCopInput,
  todayInColombia,
} from '../model/custody-view';
import {
  CheckField,
  Field,
  FormDialog,
  Notice,
  ReasonDialog,
  ResponsiblePicker,
  Section,
  SelectField,
  TextArea,
} from './form-kit';

const FREQUENCY_OPTIONS = CUSTODY_PAYMENT_FREQUENCIES.map((value) => ({
  value,
  label: CUSTODY_PAYMENT_FREQUENCY_LABELS[value],
}));
const ID_TYPE_OPTIONS = CUSTODY_ID_TYPES.map((value) => ({
  value: value as string,
  label: CUSTODY_ID_TYPE_LABELS[value],
}));

/**
 * Borrador de contrato. Los datos de la organización, del animal y del
 * responsable salen de lo ya registrado: aquí solo se piden los términos.
 */
export function ContractDialog({
  api,
  open,
  onClose,
  onDone,
  animalId,
  animalName,
  editing,
}: {
  api: CustodyApi;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  animalId: string;
  animalName: string;
  editing?: CustodyContract | null;
}) {
  const [prefill, setPrefill] = useState<CustodyContractPrefill | null>(null);
  const [templates, setTemplates] = useState<CustodyContractTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState('');
  const [clauses, setClauses] = useState<CustodyClause[]>([]);
  const [responsibleId, setResponsibleId] = useState('');
  const [repName, setRepName] = useState('');
  const [repType, setRepType] = useState('CC');
  const [repNumber, setRepNumber] = useState('');
  const [repPosition, setRepPosition] = useState('Representante legal');
  const [startDate, setStartDate] = useState(todayInColombia());
  const [endDate, setEndDate] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');
  const [foodFee, setFoodFee] = useState('');
  const [frequency, setFrequency] = useState<CustodyPaymentFrequency>('monthly');
  const [paymentDay, setPaymentDay] = useState('');
  const [graceDays, setGraceDays] = useState('0');
  const [pickupDays, setPickupDays] = useState('10');
  const [noticeDays, setNoticeDays] = useState('8');
  const [serviceCity, setServiceCity] = useState('');
  const [paymentConditions, setPaymentConditions] = useState('');
  const [observations, setObservations] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPrefill(null);
    void Promise.all([api.prefill(animalId), api.templates()])
      .then(([data, list]) => {
        if (!alive) return;
        const usable = list.filter((t) => !t.archived);
        setPrefill(data);
        setTemplates(usable);
        const rep = editing?.representative ?? data.representative;
        setRepName(rep?.fullName ?? '');
        setRepType(rep?.documentType ?? 'CC');
        setRepNumber(rep?.documentNumber ?? '');
        setRepPosition(rep?.position ?? 'Representante legal');
        setResponsibleId(editing?.responsible.id ?? data.responsible?.id ?? '');
        const key = editing?.templateKey ?? usable[0]?.templateKey ?? '';
        setTemplateKey(key);
        setClauses(editing?.clauses ?? usable.find((t) => t.templateKey === key)?.clauses ?? []);
        setStartDate(editing?.startDate ?? todayInColombia());
        setEndDate(editing?.endDate ?? '');
        setMonthlyFee(editing ? String(editing.monthlyFeeCop) : '');
        setFoodFee(editing?.foodFeeCop !== undefined ? String(editing.foodFeeCop) : '');
        setFrequency(editing?.paymentFrequency ?? 'monthly');
        setPaymentDay(editing?.paymentDay ? String(editing.paymentDay) : '');
        setGraceDays(String(editing?.graceDays ?? 0));
        setPickupDays(String(editing?.pickupDays ?? 10));
        setNoticeDays(String(editing?.noticeDays ?? 8));
        setServiceCity(editing?.serviceCity ?? data.organization.city ?? '');
        setPaymentConditions(editing?.paymentConditions ?? '');
        setObservations(editing?.observations ?? '');
      })
      .catch(() => alive && setPrefill(null));
    return () => {
      alive = false;
    };
  }, [open, api, animalId, editing]);

  const chooseTemplate = (key: string) => {
    setTemplateKey(key);
    setClauses(templates.find((t) => t.templateKey === key)?.clauses ?? []);
  };
  const intOf = (text: string, fallback: number) => {
    const value = Number(text);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      wide
      title={
        editing
          ? `Editar el borrador ${editing.number}`
          : `Nuevo contrato de guardería para ${animalName}`
      }
      description="Se guarda como borrador. Podrás ver la vista previa antes de emitir el contrato definitivo."
      submitLabel="Guardar borrador"
      validate={() => {
        if (!responsibleId) return 'Elige al responsable del animal.';
        if (repName.trim().length < 2 || repNumber.trim().length < 3)
          return 'Completa los datos de quien firma por la organización.';
        if (!startDate) return 'Indica la fecha de inicio.';
        if (endDate && endDate < startDate)
          return 'La fecha de finalización no puede ser anterior a la de inicio.';
        if (
          monthlyFee.trim() === '' ||
          (parseCopInput(monthlyFee) === null && monthlyFee.trim() !== '0')
        )
          return 'Escribe el valor del servicio en pesos.';
        if (paymentDay && (Number(paymentDay) < 1 || Number(paymentDay) > 28))
          return 'El día de pago va de 1 a 28.';
        return null;
      }}
      onSubmit={async () => {
        const input = {
          animalId,
          responsibleId,
          representative: {
            fullName: repName.trim(),
            documentType: repType,
            documentNumber: repNumber.trim(),
            position: repPosition.trim() || 'Representante legal',
          },
          templateKey: templateKey || undefined,
          startDate,
          endDate: endDate || undefined,
          monthlyFeeCop: parseCopInput(monthlyFee) ?? 0,
          foodFeeCop: foodFee.trim() ? (parseCopInput(foodFee) ?? 0) : undefined,
          paymentFrequency: frequency,
          paymentDay: paymentDay ? Number(paymentDay) : undefined,
          graceDays: intOf(graceDays, 0),
          pickupDays: Math.max(1, intOf(pickupDays, 10)),
          noticeDays: intOf(noticeDays, 8),
          serviceCity: serviceCity.trim() || undefined,
          paymentConditions: paymentConditions.trim() || undefined,
          observations: observations.trim() || undefined,
          clauses,
        };
        if (editing) await api.updateContract(editing.id, input);
        else await api.createContract(input);
        onDone('Borrador guardado. Revisa la vista previa y emítelo cuando esté listo.');
      }}
    >
      {prefill === null ? (
        <p className="text-sm text-muted-foreground">Cargando los datos ya registrados…</p>
      ) : (
        <>
          <Section title="Datos que ya están registrados">
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Organización</dt>
                <dd>{prefill.organization.legalName ?? prefill.organization.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">NIT</dt>
                <dd>{prefill.organization.nit ?? 'Sin registrar'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Animal</dt>
                <dd>
                  {prefill.animal.name}
                  {prefill.animal.breed ? ` · ${prefill.animal.breed}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Edad</dt>
                <dd>{prefill.animal.ageLabel ?? 'Sin registrar'}</dd>
              </div>
            </dl>
            {prefill.missing.length > 0 && (
              <Notice tone="warning">
                Puedes guardar el borrador, pero para emitir el contrato falta:{' '}
                {prefill.missing.map((m) => m.message).join(' ')}
              </Notice>
            )}
          </Section>

          <Section title="Partes">
            <Field label="Responsable del animal">
              <ResponsiblePicker
                api={api}
                value={responsibleId}
                onChange={setResponsibleId}
                canCreate
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Firma por la organización">
                <Input
                  value={repName}
                  maxLength={160}
                  onChange={(e) => setRepName(e.target.value)}
                />
              </Field>
              <Field label="Cargo">
                <Input
                  value={repPosition}
                  maxLength={120}
                  onChange={(e) => setRepPosition(e.target.value)}
                />
              </Field>
              <Field label="Tipo de documento">
                <SelectField value={repType} onChange={setRepType} options={ID_TYPE_OPTIONS} />
              </Field>
              <Field label="Número de documento">
                <Input
                  value={repNumber}
                  maxLength={30}
                  onChange={(e) => setRepNumber(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Condiciones del servicio">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Fecha de inicio">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="Fecha de finalización (opcional)">
                <Input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
              <Field label="Ciudad del servicio">
                <Input
                  value={serviceCity}
                  maxLength={120}
                  onChange={(e) => setServiceCity(e.target.value)}
                />
              </Field>
              <Field label="Valor del servicio (COP)">
                <Input
                  inputMode="numeric"
                  placeholder="350.000"
                  value={monthlyFee}
                  onChange={(e) => setMonthlyFee(e.target.value)}
                />
              </Field>
              <Field label="Alimentación (COP, opcional)">
                <Input
                  inputMode="numeric"
                  value={foodFee}
                  onChange={(e) => setFoodFee(e.target.value)}
                />
              </Field>
              <Field label="Frecuencia de pago">
                <SelectField
                  value={frequency}
                  onChange={setFrequency}
                  options={FREQUENCY_OPTIONS}
                />
              </Field>
              <Field label="Día de pago (1 a 28, opcional)">
                <Input
                  inputMode="numeric"
                  value={paymentDay}
                  onChange={(e) => setPaymentDay(e.target.value)}
                />
              </Field>
              <Field label="Días de gracia">
                <Input
                  inputMode="numeric"
                  value={graceDays}
                  onChange={(e) => setGraceDays(e.target.value)}
                />
              </Field>
              <Field label="Días de aviso para terminar">
                <Input
                  inputMode="numeric"
                  value={noticeDays}
                  onChange={(e) => setNoticeDays(e.target.value)}
                />
              </Field>
              <Field label="Días para retirar al animal">
                <Input
                  inputMode="numeric"
                  value={pickupDays}
                  onChange={(e) => setPickupDays(e.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Condiciones de pago (opcional)"
              hint="Cuenta, medio de pago o acuerdos particulares."
            >
              <TextArea
                value={paymentConditions}
                onChange={setPaymentConditions}
                maxLength={3000}
                rows={2}
              />
            </Field>
            <Field label="Observaciones (opcional)">
              <TextArea value={observations} onChange={setObservations} maxLength={3000} rows={2} />
            </Field>
          </Section>

          <Section title="Plantilla y cláusulas">
            <Field label="Plantilla">
              <SelectField
                value={templateKey}
                onChange={chooseTemplate}
                options={templates.map((t) => ({
                  value: t.templateKey,
                  label: t.isBase ? t.name : `${t.name} (versión ${t.version})`,
                }))}
              />
            </Field>
            <ul className="space-y-2">
              {clauses.map((clause, index) => (
                <li key={clause.id}>
                  {clause.locked ? (
                    <p className="text-sm">
                      <span className="font-medium">{clause.title}</span>{' '}
                      <span className="text-muted-foreground">(siempre incluida)</span>
                    </p>
                  ) : (
                    <CheckField
                      checked={clause.enabled}
                      onChange={(enabled) =>
                        setClauses((list) =>
                          list.map((c, i) => (i === index ? { ...c, enabled } : c)),
                        )
                      }
                    >
                      {clause.title}
                    </CheckField>
                  )}
                </li>
              ))}
            </ul>
            <Notice>
              El texto de las cláusulas se administra en Custodia y guardería, en Plantillas. Es una
              base operativa: revísala con tu asesor jurídico antes de usarla.
            </Notice>
          </Section>
        </>
      )}
    </FormDialog>
  );
}

/** Confirmación antes de emitir el contrato definitivo. */
function IssueDialog({
  api,
  contract,
  onClose,
  onDone,
}: {
  api: CustodyApi;
  contract: CustodyContract | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  useEffect(() => {
    setError(null);
    setMissing([]);
  }, [contract]);

  const issue = async () => {
    if (!contract) return;
    setBusy(true);
    setError(null);
    setMissing([]);
    try {
      await api.issueContract(contract.id);
      onDone('Contrato emitido. Imprímelo para firma y adjunta después el ejemplar firmado.');
    } catch (cause) {
      const list = missingDataOf(cause);
      setMissing(list);
      setError(
        list.length > 0
          ? 'Falta información para emitir el contrato:'
          : friendlyErrorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={contract !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Emitir el contrato {contract?.number}</DialogTitle>
          <DialogDescription>
            Al emitirlo, sus términos, cláusulas y los datos de las partes quedan fijos. Si después
            cambias la plantilla o el perfil, este contrato no cambia. Para corregirlo habría que
            anularlo y emitir uno nuevo.
          </DialogDescription>
        </DialogHeader>
        <Notice>
          AdoptaFácil no certifica firmas electrónicas: el contrato se genera para firmarlo por
          fuera y adjuntar el ejemplar firmado.
        </Notice>
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
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Seguir revisando
          </Button>
          <Button onClick={() => void issue()} disabled={busy}>
            {busy ? 'Emitiendo…' : 'Emitir contrato definitivo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Contratos con sus acciones según el estado. */
export function ContractList({
  api,
  contracts,
  canWrite,
  canManage,
  showAnimal,
  onChanged,
  onEdit,
  onAttachSigned,
}: {
  api: CustodyApi;
  contracts: CustodyContract[];
  canWrite: boolean;
  canManage: boolean;
  showAnimal?: boolean;
  onChanged: () => void;
  onEdit?: (contract: CustodyContract) => void;
  onAttachSigned?: (contract: CustodyContract) => void;
}) {
  const { toast } = useToast();
  const [issuing, setIssuing] = useState<CustodyContract | null>(null);
  const [closing, setClosing] = useState<{
    contract: CustodyContract;
    mode: 'end' | 'cancel';
  } | null>(null);

  const done = (message: string) => {
    setIssuing(null);
    setClosing(null);
    toast({ title: message, variant: 'success' });
    onChanged();
  };
  const preview = async (contract: CustodyContract) => {
    try {
      openBlob(await api.contractPreviewBlob(contract.id));
    } catch (error) {
      toast({
        title: 'No pudimos abrir el contrato',
        description: friendlyErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  if (contracts.length === 0) {
    return (
      <EmptyState
        title="No hay contratos"
        description="Crea un contrato de guardería a partir de la plantilla y de los datos ya registrados."
      />
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {contracts.map((contract) => (
          <li key={contract.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Contrato {contract.number}</span>
                  <Badge variant={CONTRACT_STATUS_TONE[contract.status]}>
                    {CUSTODY_CONTRACT_STATUS_LABELS[contract.status]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {showAnimal ? `${contract.animalName} · ` : ''}
                  {contract.responsible.fullName} · desde el {formatDate(contract.startDate)}
                  {contract.endDate ? ` hasta el ${formatDate(contract.endDate)}` : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatCop(contract.monthlyFeeCop)} ·{' '}
                  {CUSTODY_PAYMENT_FREQUENCY_LABELS[contract.paymentFrequency]} · plantilla{' '}
                  {contract.templateName}
                  {contract.templateVersion ? ` v${contract.templateVersion}` : ''}
                </p>
                {contract.endReason && (
                  <p className="text-sm text-muted-foreground">Motivo: {contract.endReason}</p>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void preview(contract)}>
                {contract.status === 'draft' ? 'Vista previa' : 'Ver contrato'}
              </Button>
              {contract.status === 'draft' && canWrite && onEdit && (
                <Button size="sm" variant="outline" onClick={() => onEdit(contract)}>
                  Editar borrador
                </Button>
              )}
              {contract.status === 'draft' && canManage && (
                <Button size="sm" onClick={() => setIssuing(contract)}>
                  Emitir
                </Button>
              )}
              {(contract.status === 'issued' || contract.status === 'active') &&
                canWrite &&
                onAttachSigned && (
                  <Button
                    size="sm"
                    variant={contract.status === 'issued' ? 'default' : 'outline'}
                    onClick={() => onAttachSigned(contract)}
                  >
                    Adjuntar firmado
                  </Button>
                )}
              {(contract.status === 'issued' || contract.status === 'active') && canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setClosing({ contract, mode: 'end' })}
                >
                  Terminar
                </Button>
              )}
              {(contract.status === 'draft' || contract.status === 'issued') && canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setClosing({ contract, mode: 'cancel' })}
                >
                  Anular
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <IssueDialog api={api} contract={issuing} onClose={() => setIssuing(null)} onDone={done} />
      <ReasonDialog
        open={closing !== null}
        onClose={() => setClosing(null)}
        title={closing?.mode === 'end' ? 'Terminar el contrato' : 'Anular el contrato'}
        description={
          closing?.mode === 'end'
            ? 'Terminar el contrato no cambia la custodia del animal ni su cuenta: la salida se registra con su acta y los saldos siguen su curso.'
            : 'El contrato queda anulado y se conserva en el historial.'
        }
        submitLabel={closing?.mode === 'end' ? 'Terminar contrato' : 'Anular contrato'}
        onConfirm={async (reason) => {
          if (!closing) return;
          if (closing.mode === 'end') await api.endContract(closing.contract.id, reason);
          else await api.cancelContract(closing.contract.id, reason);
          done(closing.mode === 'end' ? 'Contrato terminado.' : 'Contrato anulado.');
        }}
      />
    </>
  );
}
