import { useEffect, useState } from 'react';
import {
  CUSTODY_DOCUMENT_KIND_LABELS,
  CUSTODY_INTAKE_NOTICE,
  CUSTODY_INTAKE_REASONS,
  CUSTODY_INTAKE_REASON_LABELS,
  CUSTODY_PREVENTIVE_STATUSES,
  CUSTODY_PREVENTIVE_STATUS_LABELS,
  CUSTODY_RELEASE_TYPES,
  CUSTODY_RELEASE_TYPE_LABELS,
  CUSTODY_UPLOADABLE_DOCUMENT_KINDS,
  CUSTODY_DEBT_SEPARATION_NOTICE,
  type CustodyContract,
  type CustodyDocumentKind,
  type CustodyIntake,
  type CustodyIntakeReason,
  type CustodyPreventiveStatus,
  type CustodyReleaseType,
} from '@adoptafacil/contracts';
import { Input } from '@adoptafacil/ui';
import type { CustodyApi } from '../api/custody-api';
import {
  FILE_ACCEPT,
  formatCop,
  localInputToIso,
  nowLocalInput,
  todayInColombia,
} from '../model/custody-view';
import {
  CheckField,
  Field,
  FileField,
  FormDialog,
  Notice,
  ResponsiblePicker,
  RetrospectiveFields,
  Section,
  SelectField,
  TextArea,
} from './form-kit';

const REASON_OPTIONS = CUSTODY_INTAKE_REASONS.map((value) => ({
  value,
  label: CUSTODY_INTAKE_REASON_LABELS[value],
}));
const PREVENTIVE_OPTIONS = CUSTODY_PREVENTIVE_STATUSES.map((value) => ({
  value,
  label: CUSTODY_PREVENTIVE_STATUS_LABELS[value],
}));

function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

interface BaseProps {
  api: CustodyApi;
  animalId: string;
  animalName: string;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** Ingreso y caracterización del animal (crea el borrador o lo corrige). */
export function IntakeDialog({
  api,
  animalId,
  animalName,
  open,
  onClose,
  onDone,
  editing,
  defaultReceivedBy,
}: BaseProps & { editing?: CustodyIntake | null; defaultReceivedBy: string }) {
  const [intakeAt, setIntakeAt] = useState(nowLocalInput());
  const [reason, setReason] = useState<CustodyIntakeReason | ''>('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [origin, setOrigin] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [physicalCondition, setPhysicalCondition] = useState('');
  const [particularFeatures, setParticularFeatures] = useState('');
  const [vaccination, setVaccination] = useState<CustodyPreventiveStatus>('unknown');
  const [deworming, setDeworming] = useState<CustodyPreventiveStatus>('unknown');
  const [preventiveNotes, setPreventiveNotes] = useState('');
  const [foodProvided, setFoodProvided] = useState('');
  const [medications, setMedications] = useState('');
  const [notes, setNotes] = useState('');
  const [receivedByName, setReceivedByName] = useState('');
  const [hasVet, setHasVet] = useState(false);
  const [vetName, setVetName] = useState('');
  const [vetLicense, setVetLicense] = useState('');
  const [vetDate, setVetDate] = useState('');
  const [retro, setRetro] = useState(false);
  const [retroSource, setRetroSource] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [vetFile, setVetFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setIntakeAt(editing ? isoToLocalInput(editing.intakeAt) : nowLocalInput());
    setReason(editing?.reason ?? '');
    setReasonDetail(editing?.reasonDetail ?? '');
    setOrigin(editing?.origin ?? '');
    setResponsibleId(editing?.responsible?.id ?? '');
    setPhysicalCondition(editing?.physicalCondition ?? '');
    setParticularFeatures(editing?.particularFeatures ?? '');
    setVaccination(editing?.vaccinationStatus ?? 'unknown');
    setDeworming(editing?.dewormingStatus ?? 'unknown');
    setPreventiveNotes(editing?.preventiveNotes ?? '');
    setFoodProvided(editing?.foodProvided ?? '');
    setMedications(editing?.medicationsReported ?? '');
    setNotes(editing?.notes ?? '');
    setReceivedByName(editing?.receivedByName ?? defaultReceivedBy);
    setHasVet(editing?.hasVetAssessment ?? false);
    setVetName(editing?.vetName ?? '');
    setVetLicense(editing?.vetLicense ?? '');
    setVetDate(editing?.vetAssessmentDate ?? '');
    setRetro(editing?.isRetrospective ?? false);
    setRetroSource(editing?.retrospectiveSource ?? '');
    setPhotos([]);
    setVetFile(null);
  }, [open, editing, defaultReceivedBy]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      wide
      title={
        editing ? `Corregir el ingreso de ${animalName}` : `Registrar el ingreso de ${animalName}`
      }
      description="Se guarda como borrador. Cuando esté completo, genera el acta: desde ese momento ya no se modifica."
      submitLabel="Guardar borrador"
      validate={() => {
        if (!localInputToIso(intakeAt)) return 'Indica la fecha y la hora de ingreso.';
        if (!reason) return 'Elige el motivo del ingreso.';
        if (physicalCondition.trim().length < 3) return 'Describe la condición física observable.';
        if (receivedByName.trim().length < 2) return 'Escribe quién recibe al animal.';
        if (hasVet && vetName.trim().length < 2)
          return 'Escribe el nombre del profesional que hizo la valoración.';
        if (retro && retroSource.trim().length < 5)
          return 'Indica de dónde sale la información del registro retrospectivo.';
        return null;
      }}
      onSubmit={async () => {
        const input = {
          intakeAt: localInputToIso(intakeAt),
          reason: reason as CustodyIntakeReason,
          reasonDetail: reasonDetail.trim() || undefined,
          origin: origin.trim() || undefined,
          responsibleId: responsibleId || undefined,
          physicalCondition: physicalCondition.trim(),
          particularFeatures: particularFeatures.trim() || undefined,
          vaccinationStatus: vaccination,
          dewormingStatus: deworming,
          preventiveNotes: preventiveNotes.trim() || undefined,
          foodProvided: foodProvided.trim() || undefined,
          medicationsReported: medications.trim() || undefined,
          notes: notes.trim() || undefined,
          receivedByName: receivedByName.trim(),
          hasVetAssessment: hasVet,
          vetName: hasVet ? vetName.trim() || undefined : undefined,
          vetLicense: hasVet ? vetLicense.trim() || undefined : undefined,
          vetAssessmentDate: hasVet ? vetDate || undefined : undefined,
          isRetrospective: retro,
          retrospectiveSource: retro ? retroSource.trim() : undefined,
        };
        const saved = editing
          ? await api.updateIntake(editing.id, input)
          : await api.createIntake(animalId, input);
        for (const photo of photos) await api.addIntakePhoto(saved.id, photo);
        if (hasVet && vetFile) {
          await api.uploadDocument(
            animalId,
            {
              kind: 'vet_assessment',
              title: `Valoración veterinaria de ingreso${vetName.trim() ? ` · ${vetName.trim()}` : ''}`,
              intakeId: saved.id,
              documentDate: vetDate || undefined,
            },
            vetFile,
          );
        }
        onDone('Ingreso guardado como borrador. Revísalo y genera el acta.');
      }}
    >
      <Section title="Ingreso">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha y hora de ingreso">
            <Input
              type="datetime-local"
              value={intakeAt}
              max={nowLocalInput()}
              onChange={(e) => setIntakeAt(e.target.value)}
            />
          </Field>
          <Field label="Motivo">
            <SelectField
              value={reason}
              onChange={setReason}
              options={REASON_OPTIONS}
              placeholder="Elige el motivo"
            />
          </Field>
          <Field label="Detalle del motivo (opcional)">
            <Input
              value={reasonDetail}
              maxLength={300}
              onChange={(e) => setReasonDetail(e.target.value)}
            />
          </Field>
          <Field label="Procedencia (opcional)" hint="De dónde viene el animal.">
            <Input value={origin} maxLength={300} onChange={(e) => setOrigin(e.target.value)} />
          </Field>
        </div>
        <RetrospectiveFields
          checked={retro}
          source={retroSource}
          onChecked={setRetro}
          onSource={setRetroSource}
        />
      </Section>

      <Section title="Persona que entrega">
        <ResponsiblePicker
          api={api}
          value={responsibleId}
          onChange={setResponsibleId}
          canCreate
          optional
        />
      </Section>

      <Section title="Lo que la organización observa">
        <Notice>{CUSTODY_INTAKE_NOTICE}</Notice>
        <Field
          label="Condición física observable"
          hint="Lo que se ve: ánimo, pelaje, peso aparente, movilidad."
        >
          <TextArea value={physicalCondition} onChange={setPhysicalCondition} maxLength={3000} />
        </Field>
        <Field
          label="Características particulares (opcional)"
          hint="Cicatrices, lesiones visibles, amputaciones, movilidad reducida, orejas, señas."
        >
          <TextArea
            value={particularFeatures}
            onChange={setParticularFeatures}
            maxLength={3000}
            rows={2}
          />
        </Field>
        <Field
          label="Fotografías de referencia (opcional)"
          hint="JPG, PNG o WebP. Puedes elegir varias."
        >
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2"
            onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
          />
        </Field>
      </Section>

      <Section title="Lo que informa quien entrega">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vacunación">
            <SelectField
              value={vaccination}
              onChange={setVaccination}
              options={PREVENTIVE_OPTIONS}
            />
          </Field>
          <Field label="Desparasitación">
            <SelectField value={deworming} onChange={setDeworming} options={PREVENTIVE_OPTIONS} />
          </Field>
        </div>
        <Field label="Detalle de vacunas y desparasitación (opcional)">
          <Input
            value={preventiveNotes}
            maxLength={300}
            onChange={(e) => setPreventiveNotes(e.target.value)}
          />
        </Field>
        <Field label="Alimentación suministrada (opcional)">
          <Input
            value={foodProvided}
            maxLength={300}
            onChange={(e) => setFoodProvided(e.target.value)}
          />
        </Field>
        <Field
          label="Medicamentos o tratamientos informados (opcional)"
          hint="Tal como lo informa quien entrega. La organización no lo valida ni lo interpreta."
        >
          <TextArea value={medications} onChange={setMedications} maxLength={3000} rows={2} />
        </Field>
      </Section>

      <Section title="Valoración veterinaria">
        <CheckField checked={hasVet} onChange={setHasVet}>
          El animal ingresa con una valoración hecha por un médico veterinario.
        </CheckField>
        {hasVet && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Profesional">
                <Input
                  value={vetName}
                  maxLength={160}
                  onChange={(e) => setVetName(e.target.value)}
                />
              </Field>
              <Field label="Tarjeta profesional">
                <Input
                  value={vetLicense}
                  maxLength={60}
                  onChange={(e) => setVetLicense(e.target.value)}
                />
              </Field>
              <Field label="Fecha de la valoración">
                <Input
                  type="date"
                  value={vetDate}
                  max={todayInColombia()}
                  onChange={(e) => setVetDate(e.target.value)}
                />
              </Field>
            </div>
            <FileField
              label="Documento del profesional"
              hint="El diagnóstico consta en el documento del veterinario. El acta no lo resume."
              accept={FILE_ACCEPT}
              onChange={setVetFile}
            />
          </>
        )}
      </Section>

      <Section title="Recepción">
        <Field label="Persona que recibe por la organización">
          <Input
            value={receivedByName}
            maxLength={160}
            onChange={(e) => setReceivedByName(e.target.value)}
          />
        </Field>
        <Field label="Observaciones (opcional)">
          <TextArea value={notes} onChange={setNotes} maxLength={3000} rows={2} />
        </Field>
        <Notice>
          El acta se imprime para firma de quien entrega y de quien recibe. Después puedes adjuntar
          el ejemplar firmado en Documentos.
        </Notice>
      </Section>
    </FormDialog>
  );
}

/** Acta de entrega o salida. La deuda nunca la impide. */
export function ReleaseDialog({
  api,
  animalId,
  animalName,
  open,
  onClose,
  onDone,
  pendingCop,
  canDecide,
  defaultDeliveredBy,
  defaultReceivedBy,
}: BaseProps & {
  pendingCop: number;
  canDecide: boolean;
  defaultDeliveredBy: string;
  defaultReceivedBy?: string;
}) {
  const [releaseType, setReleaseType] = useState<CustodyReleaseType>('return_to_responsible');
  const [releasedAt, setReleasedAt] = useState(nowLocalInput());
  const [receivedByName, setReceivedByName] = useState('');
  const [receivedByDocument, setReceivedByDocument] = useState('');
  const [receivedByPhone, setReceivedByPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveredByName, setDeliveredByName] = useState('');
  const [authorityName, setAuthorityName] = useState('');
  const [authorityBasis, setAuthorityBasis] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [retro, setRetro] = useState(false);
  const [retroSource, setRetroSource] = useState('');

  useEffect(() => {
    if (!open) return;
    setReleaseType('return_to_responsible');
    setReleasedAt(nowLocalInput());
    setReceivedByName(defaultReceivedBy ?? '');
    setReceivedByDocument('');
    setReceivedByPhone('');
    setRelation('');
    setCondition('');
    setNotes('');
    setDeliveredByName(defaultDeliveredBy);
    setAuthorityName('');
    setAuthorityBasis('');
    setReviewed(false);
    setConfirmed(false);
    setRetro(false);
    setRetroSource('');
  }, [open, defaultDeliveredBy, defaultReceivedBy]);

  const isAuthority = releaseType === 'handover_to_authority';
  const options = CUSTODY_RELEASE_TYPES.filter(
    (value) => canDecide || value !== 'handover_to_authority',
  ).map((value) => ({ value, label: CUSTODY_RELEASE_TYPE_LABELS[value] }));

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      wide
      title={`Registrar la salida de ${animalName}`}
      description="Genera el acta de entrega y salida. Es un documento definitivo: no se modifica después."
      submitLabel="Generar acta de salida"
      validate={() => {
        if (!localInputToIso(releasedAt)) return 'Indica la fecha y la hora de salida.';
        if (receivedByName.trim().length < 2) return 'Escribe quién recibe al animal.';
        if (condition.trim().length < 3) return 'Describe la condición observable al salir.';
        if (deliveredByName.trim().length < 2) return 'Escribe quién entrega por la organización.';
        if (isAuthority && authorityName.trim().length < 3)
          return 'Indica a qué autoridad se entrega.';
        if (isAuthority && authorityBasis.trim().length < 10)
          return 'Explica el fundamento y el procedimiento seguido.';
        if (isAuthority && !reviewed)
          return 'Confirma que una persona de la organización revisó el caso y tomó la decisión.';
        if (retro && retroSource.trim().length < 5)
          return 'Indica de dónde sale la información del registro retrospectivo.';
        if (!confirmed)
          return 'Confirma que los datos son correctos: el acta no se puede modificar.';
        return null;
      }}
      onSubmit={async () => {
        await api.createRelease(animalId, {
          releaseType,
          releasedAt: localInputToIso(releasedAt),
          receivedByName: receivedByName.trim(),
          receivedByDocument: receivedByDocument.trim() || undefined,
          receivedByPhone: receivedByPhone.trim() || undefined,
          receivedByRelation: relation.trim() || undefined,
          conditionAtRelease: condition.trim(),
          notes: notes.trim() || undefined,
          deliveredByName: deliveredByName.trim(),
          authorityName: isAuthority ? authorityName.trim() : undefined,
          authorityBasis: isAuthority ? authorityBasis.trim() : undefined,
          humanReviewConfirmed: isAuthority ? reviewed : undefined,
          isRetrospective: retro,
          retrospectiveSource: retro ? retroSource.trim() : undefined,
        });
        onDone('Salida registrada. El acta quedó en los documentos del animal.');
      }}
    >
      {pendingCop > 0 && (
        <Notice tone="warning">
          Hay un saldo pendiente de {formatCop(pendingCop)}. {CUSTODY_DEBT_SEPARATION_NOTICE} El
          acta lo anotará solo como información.
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo de salida">
          <SelectField value={releaseType} onChange={setReleaseType} options={options} />
        </Field>
        <Field label="Fecha y hora">
          <Input
            type="datetime-local"
            value={releasedAt}
            max={nowLocalInput()}
            onChange={(e) => setReleasedAt(e.target.value)}
          />
        </Field>
      </div>
      {isAuthority && (
        <Section title="Entrega a una autoridad competente">
          <Notice tone="warning">
            Esta entrega nunca es automática ni consecuencia de una deuda. La decide una persona de
            la organización, según el procedimiento que corresponda, y queda con su nombre.
          </Notice>
          <Field label="Autoridad que recibe">
            <Input
              value={authorityName}
              maxLength={300}
              onChange={(e) => setAuthorityName(e.target.value)}
            />
          </Field>
          <Field label="Fundamento y procedimiento seguido">
            <TextArea value={authorityBasis} onChange={setAuthorityBasis} maxLength={3000} />
          </Field>
          <CheckField checked={reviewed} onChange={setReviewed}>
            Revisé el caso y tomo esta decisión en nombre de la organización.
          </CheckField>
        </Section>
      )}
      <Section title="Quien recibe">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <Input
              value={receivedByName}
              maxLength={160}
              onChange={(e) => setReceivedByName(e.target.value)}
            />
          </Field>
          <Field label="Documento (opcional)">
            <Input
              value={receivedByDocument}
              maxLength={40}
              onChange={(e) => setReceivedByDocument(e.target.value)}
            />
          </Field>
          <Field label="Teléfono (opcional)">
            <Input
              value={receivedByPhone}
              maxLength={40}
              onChange={(e) => setReceivedByPhone(e.target.value)}
            />
          </Field>
          <Field label="Relación con el animal (opcional)">
            <Input value={relation} maxLength={120} onChange={(e) => setRelation(e.target.value)} />
          </Field>
        </div>
      </Section>
      <Section title="Condición y entrega">
        <Field label="Condición observable al salir" hint="Lo que se ve. No es un diagnóstico.">
          <TextArea value={condition} onChange={setCondition} maxLength={3000} />
        </Field>
        <Field label="Entrega por la organización">
          <Input
            value={deliveredByName}
            maxLength={160}
            onChange={(e) => setDeliveredByName(e.target.value)}
          />
        </Field>
        <Field label="Observaciones (opcional)">
          <TextArea value={notes} onChange={setNotes} maxLength={3000} rows={2} />
        </Field>
        <RetrospectiveFields
          checked={retro}
          source={retroSource}
          onChecked={setRetro}
          onSource={setRetroSource}
        />
      </Section>
      <CheckField checked={confirmed} onChange={setConfirmed}>
        Revisé los datos. Entiendo que el acta es definitiva y no se puede modificar.
      </CheckField>
    </FormDialog>
  );
}

/** Novedad, incidente o nota en el historial. */
export function EventDialog({ api, animalId, animalName, open, onClose, onDone }: BaseProps) {
  const [type, setType] = useState<'incident' | 'note'>('incident');
  const [summary, setSummary] = useState('');
  const [detail, setDetail] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowLocalInput());
  const [notified, setNotified] = useState(false);
  const [retro, setRetro] = useState(false);
  const [retroSource, setRetroSource] = useState('');

  useEffect(() => {
    if (!open) return;
    setType('incident');
    setSummary('');
    setDetail('');
    setOccurredAt(nowLocalInput());
    setNotified(false);
    setRetro(false);
    setRetroSource('');
  }, [open]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`Registrar una novedad de ${animalName}`}
      description="Queda en el historial con fecha y con tu nombre. No se puede editar después."
      submitLabel="Registrar"
      validate={() => {
        if (summary.trim().length < 3) return 'Resume qué pasó.';
        if (!localInputToIso(occurredAt)) return 'Indica cuándo ocurrió.';
        if (retro && retroSource.trim().length < 5) return 'Indica de dónde sale la información.';
        return null;
      }}
      onSubmit={async () => {
        await api.createEvent(animalId, {
          type,
          summary: summary.trim(),
          detail: detail.trim() || undefined,
          occurredAt: localInputToIso(occurredAt),
          responsibleNotified: type === 'incident' ? notified : undefined,
          isRetrospective: retro,
          retrospectiveSource: retro ? retroSource.trim() : undefined,
        });
        onDone('Novedad registrada en el historial.');
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo">
          <SelectField
            value={type}
            onChange={setType}
            options={[
              { value: 'incident', label: 'Novedad o incidente' },
              { value: 'note', label: 'Nota' },
            ]}
          />
        </Field>
        <Field label="Cuándo ocurrió">
          <Input
            type="datetime-local"
            value={occurredAt}
            max={nowLocalInput()}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Resumen">
        <Input value={summary} maxLength={300} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <Field
        label="Detalle (opcional)"
        hint="Describe lo observado. Los diagnósticos corresponden al veterinario."
      >
        <TextArea value={detail} onChange={setDetail} maxLength={3000} />
      </Field>
      {type === 'incident' && (
        <CheckField checked={notified} onChange={setNotified}>
          Ya se avisó al responsable del animal.
        </CheckField>
      )}
      <RetrospectiveFields
        checked={retro}
        source={retroSource}
        onChecked={setRetro}
        onSource={setRetroSource}
      />
    </FormDialog>
  );
}

/** Adjuntar un documento externo o una evidencia. */
export function UploadDialog({
  api,
  animalId,
  animalName,
  open,
  onClose,
  onDone,
  contracts,
  presetKind,
  presetContractId,
}: BaseProps & {
  contracts: CustodyContract[];
  presetKind?: CustodyDocumentKind;
  presetContractId?: string;
}) {
  const [kind, setKind] = useState<CustodyDocumentKind | ''>('');
  const [title, setTitle] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [contractId, setContractId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [retro, setRetro] = useState(false);
  const [retroSource, setRetroSource] = useState('');

  useEffect(() => {
    if (!open) return;
    setKind(presetKind ?? '');
    setTitle(presetKind ? CUSTODY_DOCUMENT_KIND_LABELS[presetKind] : '');
    setDocumentDate('');
    setContractId(presetContractId ?? '');
    setFile(null);
    setRetro(false);
    setRetroSource('');
  }, [open, presetKind, presetContractId]);

  const signable = contracts.filter((c) => c.status !== 'draft' && c.status !== 'cancelled');

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`Adjuntar un documento de ${animalName}`}
      description="PDF o imagen. Lo que se adjunta no se reemplaza ni se borra: una versión nueva queda como la siguiente."
      submitLabel="Adjuntar"
      validate={() => {
        if (!kind) return 'Elige el tipo de documento.';
        if (title.trim().length < 2) return 'Escribe un título.';
        if (kind === 'signed_contract' && !contractId)
          return 'Elige a qué contrato corresponde el ejemplar firmado.';
        if (!file) return 'Elige el archivo.';
        if (retro && retroSource.trim().length < 5) return 'Indica de dónde sale la información.';
        return null;
      }}
      onSubmit={async () => {
        await api.uploadDocument(
          animalId,
          {
            kind,
            title: title.trim(),
            documentDate: documentDate || undefined,
            contractId: kind === 'signed_contract' ? contractId : undefined,
            isRetrospective: retro,
            retrospectiveSource: retro ? retroSource.trim() : undefined,
          },
          file as File,
        );
        onDone(
          kind === 'signed_contract'
            ? 'Contrato firmado adjuntado. El contrato queda vigente.'
            : 'Documento adjuntado al historial.',
        );
      }}
    >
      <Field label="Tipo de documento">
        <SelectField
          value={kind}
          onChange={(value) => {
            setKind(value);
            if (!title.trim()) setTitle(CUSTODY_DOCUMENT_KIND_LABELS[value]);
          }}
          placeholder="Elige el tipo"
          options={CUSTODY_UPLOADABLE_DOCUMENT_KINDS.map((value) => ({
            value,
            label: CUSTODY_DOCUMENT_KIND_LABELS[value],
          }))}
        />
      </Field>
      {kind === 'signed_contract' && (
        <Field label="Contrato">
          <SelectField
            value={contractId}
            onChange={setContractId}
            placeholder={signable.length > 0 ? 'Elige el contrato' : 'No hay contratos emitidos'}
            options={signable.map((c) => ({
              value: c.id,
              label: `${c.number} · ${c.responsible.fullName}`,
            }))}
          />
        </Field>
      )}
      {(kind === 'clinical_history' || kind === 'vet_assessment') && (
        <Notice>
          Es el documento del médico veterinario. AdoptaFácil lo guarda tal cual; no genera
          historias clínicas ni diagnósticos.
        </Notice>
      )}
      {kind === 'electronic_invoice' && (
        <Notice>
          Adjunta la factura que la organización expidió por su propio sistema de facturación.
          AdoptaFácil no emite facturas electrónicas.
        </Notice>
      )}
      <Field label="Título">
        <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Fecha del documento (opcional)">
        <Input
          type="date"
          value={documentDate}
          max={todayInColombia()}
          onChange={(e) => setDocumentDate(e.target.value)}
        />
      </Field>
      <FileField
        label="Archivo"
        hint="PDF, JPG, PNG o WebP."
        accept={FILE_ACCEPT}
        onChange={setFile}
      />
      <RetrospectiveFields
        checked={retro}
        source={retroSource}
        onChecked={setRetro}
        onSource={setRetroSource}
      />
    </FormDialog>
  );
}
