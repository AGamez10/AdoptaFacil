import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  AdopterDocumentType,
  AdoptionContract,
  AdoptionContractData,
  AdoptionFollowUpPlan,
  AnimalIdentificationType,
  AnimalSex,
} from '@adoptafacil/contracts';
import {
  ADOPTER_DOCUMENT_TYPE_LABELS,
  ANIMAL_IDENTIFICATION_LABELS,
  DEFAULT_FOLLOW_UP_MONTHS,
  FOLLOW_UP_PLAN_LABELS,
  Role,
  buildAdoptionContractDocument,
} from '@adoptafacil/contracts';
import { Badge, Button, EmptyState, Input, Skeleton, useToast } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { ApiError, useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
// TODO(client): `SignaturePad` vive en el feature `org` (M01) — es un
// componente de dibujo puro, sin lógica de negocio, candidato a moverse a
// `packages/ui`; mientras tanto se reutiliza cross-feature (mismo criterio
// que CLAUDE.md permite para una versión feature-local temporal).
import { SignaturePad } from '../../org/components/signature-pad';
import {
  downloadAdoptionContractPdf,
  getContractForOrgById,
  getContractForSigner,
  getSignatureImageUrl,
  signAdoptionContract,
  transitionAdoptionContract,
  updateAdoptionContractData,
} from '../api/adoptions-api';
import {
  CONTRACT_STATUS_LABELS,
  SIGNER_ROLE_LABELS,
  contractStatusVariant,
  shortHash,
} from '../model/adoptions-contract-view';
import { formatBogota } from '../model/adoptions-view';

const SEX_OPTIONS: Array<{ value: AnimalSex; label: string }> = [
  { value: 'male', label: 'Macho' },
  { value: 'female', label: 'Hembra' },
  { value: 'unknown', label: 'Sin especificar' },
];

const SELECT_CLASS = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/** `<select>` de sí/no/sin indicar para un campo booleano opcional. */
function yesNoValue(value: boolean | undefined): string {
  return value === undefined ? '' : value ? 'yes' : 'no';
}
function parseYesNo(value: string): boolean | undefined {
  return value === '' ? undefined : value === 'yes';
}

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/** Lee un `File` como base64 (sin el prefijo `data:...;base64,`) — mismo
 *  helper que `org-legal-representative-page.tsx` ya usa para "Subir imagen". */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function FormField(props: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">
        {props.label}
        {props.required && <span className="text-destructive"> *</span>}
      </span>
      {props.children}
    </label>
  );
}

/**
 * `/adopciones/contratos/:id` (M04, T-028b — nuevo requerimiento: "no se
 * muestra realmente el contrato"). Dos audiencias:
 *   - la organización (Owner/Administrator/Operator): diligencia los datos
 *     (peso, estado de salud, y corrige cualquier otro campo auto-rellenado),
 *     firma como representante (reutiliza la firma YA registrada del
 *     representante legal — requerimiento #16, sin dibujar nada nuevo), y
 *     envía a firmas.
 *   - el adoptante: ve el contrato de solo lectura y, una vez enviado a
 *     firmas, dibuja/sube su propia firma para firmar su parte.
 * Ambas pueden descargar el PDF real en cualquier momento (previsualizar el
 * borrador antes de enviarlo).
 */
export function AdoptionContractPage() {
  const { id } = useParams<{ id: string }>();
  const client = useApiClient();
  const { hasAnyRole, user } = useSession();
  const { toast } = useToast();
  const canManage = hasAnyRole(Role.Owner, Role.Administrator, Role.Operator);

  const [state, setState] = useState<LoadState>('loading');
  const [contract, setContract] = useState<AdoptionContract | null>(null);
  const [form, setForm] = useState<AdoptionContractData | null>(null);
  const [savingData, setSavingData] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<'draw' | 'upload'>('draw');
  // Nuevo requerimiento: la vista en pantalla mostraba solo el nombre del
  // firmante, no la firma dibujada/subida en sí — se piden las imágenes
  // reales (objectURL) por firmante ya firmado, y se cachean por id para no
  // volver a pedir la misma al re-renderizar. `objectUrlsRef` guarda TODAS
  // las URLs creadas en la vida de la página para revocarlas al desmontar
  // (evita fugas de memoria del blob), independiente de cuáles sigan en uso.
  const [signatureUrls, setSignatureUrls] = useState<Record<string, string>>({});
  const objectUrlsRef = useRef<string[]>([]);
  const fetchingSignerIdsRef = useRef<Set<string>>(new Set());

  useEffect(
    () => () => {
      // `URL.revokeObjectURL` is a standard browser API, but some test
      // environments (jsdom) don't implement it — never let cleanup itself
      // crash the unmount.
      objectUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* best-effort cleanup only */
        }
      });
    },
    [],
  );

  const load = async (): Promise<void> => {
    if (!id) {
      setState('not-found');
      return;
    }
    try {
      const c = canManage
        ? await getContractForOrgById(client, id)
        : await getContractForSigner(client, id);
      setContract(c);
      setForm(c.payload.data);
      setState('ready');
    } catch (error) {
      setState(ApiError.is(error) && error.status === 404 ? 'not-found' : 'error');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  // Pide la imagen real de cada firmante YA firmado que todavía no tengamos
  // en caché — se dispara de nuevo cada vez que alguien firma (cambia
  // `signedAt`), para recoger justo la firma nueva sin re-pedir las demás.
  useEffect(() => {
    if (!contract) return;
    const pending = contract.signers.filter(
      (s) => s.signedAt && !fetchingSignerIdsRef.current.has(s.id),
    );
    if (pending.length === 0) return;
    let active = true;
    for (const s of pending) fetchingSignerIdsRef.current.add(s.id);
    void Promise.all(
      pending.map(async (s) => {
        const url = await getSignatureImageUrl(client, canManage, contract.id, s.id);
        if (active && url) {
          objectUrlsRef.current.push(url);
          setSignatureUrls((prev) => ({ ...prev, [s.id]: url }));
        }
      }),
    );
    return () => {
      active = false;
    };
  }, [contract, canManage, client]);

  if (state === 'loading' || !contract || !form) {
    return (
      <PageContainer>
        <PageHeader title="Contrato de adopción" />
        {state === 'not-found' ? (
          <EmptyState title="Contrato no encontrado" description="Verifica el enlace." />
        ) : state === 'error' ? (
          <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </PageContainer>
    );
  }

  const representative = contract.signers.find((s) => s.role === 'organization_representative');
  const mySigner = contract.signers.find((s) => s.userId === user?.id && !s.signedAt);
  const noOneHasSignedYet = !contract.signers.some((s) => s.signedAt);
  const canEditData = contract.status === 'draft' && noOneHasSignedYet;
  const canSignAsRepresentative =
    canManage && contract.status === 'draft' && !representative?.signedAt;
  const canSendToSignatures =
    canManage && contract.status === 'draft' && Boolean(representative?.signedAt);
  // Adoptante, responsable firmante o testigo: todos firman dibujando/subiendo
  // su propia firma (antes solo el adoptante tenía el botón).
  const canSignAsAdopter =
    Boolean(mySigner) &&
    mySigner?.role !== 'organization_representative' &&
    contract.status === 'pending_signatures';
  const isV2 = contract.payload.templateVersion === 'v2';

  const setField = <K extends keyof AdoptionContractData>(
    key: K,
    value: AdoptionContractData[K],
  ): void => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveData = async (): Promise<void> => {
    if (!form) return;
    setSavingData(true);
    try {
      const updated = await updateAdoptionContractData(client, contract.id, form);
      setContract(updated);
      setForm(updated.payload.data);
      toast({ title: 'Datos guardados', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudieron guardar los datos',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSavingData(false);
    }
  };

  const signAsRepresentative = async (): Promise<void> => {
    if (!representative) return;
    setBusyAction(true);
    try {
      const updated = await signAdoptionContract(client, contract.id, {
        signerId: representative.id,
      });
      setContract(updated);
      toast({ title: 'Firmado como representante', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo firmar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const sendToSignatures = async (): Promise<void> => {
    setBusyAction(true);
    try {
      const updated = await transitionAdoptionContract(client, contract.id, {
        targetStatus: 'pending_signatures',
      });
      setContract(updated);
      toast({ title: 'Contrato enviado a firmas', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo enviar a firmas',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusyAction(false);
    }
  };

  const signAsAdopter = async (): Promise<void> => {
    if (!mySigner || !signatureBase64) return;
    setBusyAction(true);
    try {
      const updated = await signAdoptionContract(client, contract.id, {
        signerId: mySigner.id,
        signatureBase64,
        signatureContentType: 'image/png',
      });
      setContract(updated);
      setSignatureBase64(null);
      toast({ title: 'Firma registrada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo firmar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusyAction(false);
    }
  };

  // Mismo texto legal (y misma versión) que el PDF: una sola fuente en
  // `@adoptafacil/contracts`.
  const contractDoc = buildAdoptionContractDocument(contract.payload, contract.signers);
  const lastSignedAt = contract.signers
    .map((s) => s.signedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  return (
    <PageContainer>
      <PageHeader
        title="Contrato de adopción"
        description="Contrato de Adopción de Animal — Ley 84/1989, 1774/2016 y 2455/2025."
      />
      <Link
        to="/adopciones"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Volver a adopciones
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge variant={contractStatusVariant(contract.status)}>
          {CONTRACT_STATUS_LABELS[contract.status]}
        </Badge>
        {contract.status === 'signed' && (
          <span className="break-all text-xs text-muted-foreground" title={contract.contentHash}>
            Sellado · hash {shortHash(contract.contentHash)}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => void downloadAdoptionContractPdf(client, canManage, contract.id)}
        >
          Descargar PDF
        </Button>
      </div>

      <div className="space-y-6">
        {/* --- Vista previa del texto legal (solo lectura) --- */}
        <section className="space-y-4 rounded-md border p-4 text-sm">
          <h2 className="text-center text-lg font-bold">{contractDoc.title}</h2>
          {contract.status !== 'signed' && (
            <p className="rounded-md bg-muted/40 p-2 text-center text-xs text-muted-foreground">
              Borrador: así se verá el contrato. Cuando todas las partes firmen, cada una recibe una
              copia en PDF en su correo y el contrato queda guardado aquí.
            </p>
          )}

          {contractDoc.sections.map((section) => (
            <div key={section.heading}>
              <h3 className="font-semibold">{section.heading}</h3>
              {section.blocks.map((block, index) =>
                block.kind === 'fields' ? (
                  <dl
                    key={index}
                    className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 rounded-md border bg-muted/30 p-3 sm:grid-cols-2"
                  >
                    {block.fields.map((f) => (
                      <div key={f.label} className="flex justify-between gap-2 text-xs">
                        <dt className="font-medium">{f.label}</dt>
                        <dd className="text-right text-muted-foreground">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : block.kind === 'clause' ? (
                  <p key={index} className="mt-1 pl-3 text-muted-foreground">
                    <span className="font-medium text-foreground">{block.title}: </span>
                    {block.text}
                  </p>
                ) : (
                  <p key={index} className="mt-1 text-muted-foreground">
                    {block.text}
                  </p>
                ),
              )}
            </div>
          ))}

          <p className="text-muted-foreground">
            Firmado en {contractDoc.signatureCity}, el{' '}
            {lastSignedAt ? formatBogota(lastSignedAt) : '______'}.
          </p>

          <div className="grid grid-cols-1 gap-4 border-t pt-3 sm:grid-cols-2">
            {contract.signers.map((signer) => (
              <div key={signer.id} className="text-xs">
                <p className="font-medium">{contractDoc.signerLabels[signer.role]}</p>
                {signer.signedAt && signatureUrls[signer.id] && (
                  <img
                    src={signatureUrls[signer.id]}
                    alt={`Firma de ${signer.fullName}`}
                    className="h-16 object-contain"
                  />
                )}
                <p>{signer.fullName}</p>
                <p className="text-muted-foreground">
                  {signer.signedAt
                    ? `Firmado el ${formatBogota(signer.signedAt)}`
                    : 'Pendiente de firma'}
                </p>
              </div>
            ))}
          </div>
          {contract.status === 'signed' && (
            <p className="break-all border-t pt-3 text-xs text-muted-foreground">
              Huella SHA-256 del contenido firmado: {contract.contentHash}
            </p>
          )}
        </section>

        {/* --- Diligenciar datos (org, mientras nadie ha firmado) --- */}
        {canManage && canEditData && (
          <section className="space-y-3 rounded-md border p-4">
            <h3 className="font-semibold">Diligenciar datos del contrato</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Peso (kg)" required>
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={form.weightKg ?? ''}
                  onChange={(e) => setField('weightKg', e.target.valueAsNumber || undefined)}
                />
              </FormField>
              <FormField label="Sexo">
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.animalSex ?? ''}
                  onChange={(e) => setField('animalSex', e.target.value || undefined)}
                >
                  <option value="">Sin especificar</option>
                  {SEX_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Raza">
                <Input
                  value={form.animalBreed ?? ''}
                  onChange={(e) => setField('animalBreed', e.target.value || undefined)}
                />
              </FormField>
              <FormField label="Edad aproximada (años)">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={form.animalAgeYears ?? ''}
                  onChange={(e) => setField('animalAgeYears', e.target.valueAsNumber || undefined)}
                />
              </FormField>
              <FormField label="NIT de la organización">
                <Input
                  value={form.organizationNit ?? ''}
                  onChange={(e) => setField('organizationNit', e.target.value || undefined)}
                />
              </FormField>
              <FormField label="Domicilio de la organización">
                <Input
                  value={form.organizationAddress ?? ''}
                  onChange={(e) => setField('organizationAddress', e.target.value || undefined)}
                />
              </FormField>
              {isV2 && (
                <FormField label="Tipo de documento del adoptante">
                  <select
                    className={SELECT_CLASS}
                    value={form.adopterDocumentType ?? ''}
                    onChange={(e) =>
                      setField(
                        'adopterDocumentType',
                        (e.target.value || undefined) as AdopterDocumentType | undefined,
                      )
                    }
                  >
                    <option value="">Sin indicar</option>
                    {Object.entries(ADOPTER_DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              <FormField label="Número de documento del adoptante">
                <Input
                  value={form.adopterDocumentNumber ?? ''}
                  onChange={(e) => setField('adopterDocumentNumber', e.target.value || undefined)}
                />
              </FormField>
              <FormField label="Domicilio del adoptante">
                <Input
                  value={form.adopterAddress ?? ''}
                  onChange={(e) => setField('adopterAddress', e.target.value || undefined)}
                />
              </FormField>
              <FormField label="Ciudad (jurisdicción / firma)">
                <Input
                  value={form.signatureCity ?? ''}
                  onChange={(e) => setField('signatureCity', e.target.value || undefined)}
                />
              </FormField>
              <FormField label="Meses de seguimiento post-adopción">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={form.followUpMonths}
                  onChange={(e) =>
                    setField('followUpMonths', e.target.valueAsNumber || DEFAULT_FOLLOW_UP_MONTHS)
                  }
                />
              </FormField>
            </div>
            <FormField label="Estado de salud al momento de la entrega" required>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={3}
                value={form.healthStatusAtDelivery ?? ''}
                onChange={(e) => setField('healthStatusAtDelivery', e.target.value || undefined)}
              />
            </FormField>
            {isV2 && (
              <div className="space-y-3 border-t pt-3">
                <h4 className="text-sm font-semibold">Entrega, identidad y seguimiento</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField label="Nombre de la organización (cedente)">
                    <Input
                      value={form.organizationName ?? ''}
                      onChange={(e) => setField('organizationName', e.target.value || undefined)}
                    />
                  </FormField>
                  <FormField label="Identificación del animal">
                    <select
                      className={SELECT_CLASS}
                      value={form.animalIdentificationType ?? ''}
                      onChange={(e) =>
                        setField(
                          'animalIdentificationType',
                          (e.target.value || undefined) as AnimalIdentificationType | undefined,
                        )
                      }
                    >
                      <option value="">Sin indicar</option>
                      {Object.entries(ANIMAL_IDENTIFICATION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {form.animalIdentificationType && form.animalIdentificationType !== 'none' && (
                    <FormField label="Número del microchip o placa">
                      <Input
                        value={form.animalIdentificationNumber ?? ''}
                        onChange={(e) =>
                          setField('animalIdentificationNumber', e.target.value || undefined)
                        }
                      />
                    </FormField>
                  )}
                  <FormField label="¿Se entrega esterilizado?">
                    <select
                      className={SELECT_CLASS}
                      value={yesNoValue(form.animalSterilized)}
                      onChange={(e) => setField('animalSterilized', parseYesNo(e.target.value))}
                    >
                      <option value="">Sin indicar</option>
                      <option value="yes">Sí</option>
                      <option value="no">No</option>
                    </select>
                  </FormField>
                  {form.animalSterilized === false && (
                    <FormField label="Plazo para esterilizar (meses)">
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        value={form.sterilizationCommitmentMonths ?? ''}
                        onChange={(e) =>
                          setField(
                            'sterilizationCommitmentMonths',
                            e.target.valueAsNumber || undefined,
                          )
                        }
                      />
                    </FormField>
                  )}
                  <FormField label="Días de semana de prueba previa (si la hubo)">
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={form.trialPeriodDays ?? ''}
                      onChange={(e) =>
                        setField('trialPeriodDays', e.target.valueAsNumber || undefined)
                      }
                    />
                  </FormField>
                  <FormField label="Plan de seguimiento que eligió el adoptante">
                    <select
                      className={SELECT_CLASS}
                      value={form.followUpPlan ?? 'light'}
                      onChange={(e) =>
                        setField('followUpPlan', e.target.value as AdoptionFollowUpPlan)
                      }
                    >
                      {Object.entries(FOLLOW_UP_PLAN_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                          {value === 'light' ? ' (1, 4 y 12 meses)' : ' (15 días, 1, 4 y 12 meses)'}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Cuota de recuperación (pesos, 0 si no hay)">
                    <Input
                      type="number"
                      min={0}
                      step={1000}
                      value={form.recoveryFeeCop ?? ''}
                      onChange={(e) =>
                        setField(
                          'recoveryFeeCop',
                          Number.isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber,
                        )
                      }
                    />
                  </FormField>
                  <FormField label="Cuidador de respaldo (nombre)">
                    <Input
                      value={form.backupCaregiverName ?? ''}
                      onChange={(e) => setField('backupCaregiverName', e.target.value || undefined)}
                    />
                  </FormField>
                  <FormField label="Cuidador de respaldo (celular)">
                    <Input
                      inputMode="tel"
                      value={form.backupCaregiverPhone ?? ''}
                      onChange={(e) =>
                        setField('backupCaregiverPhone', e.target.value || undefined)
                      }
                    />
                  </FormField>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={form.identityDocumentVerified ?? false}
                    onChange={(e) => setField('identityDocumentVerified', e.target.checked)}
                  />
                  <span>
                    Verifiqué el documento original del adoptante y que cumple la edad mínima de
                    firma ({form.minimumSignerAge ?? 18} años). No se guarda copia del documento.
                  </span>
                </label>
                {form.backupCaregiverName && (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.backupCaregiverInformed ?? false}
                      onChange={(e) => setField('backupCaregiverInformed', e.target.checked)}
                    />
                    <span>
                      El adoptante informó al cuidador de respaldo y tiene su autorización.
                    </span>
                  </label>
                )}
              </div>
            )}
            <Button size="sm" disabled={savingData} onClick={() => void saveData()}>
              {savingData ? 'Guardando…' : 'Guardar datos'}
            </Button>
          </section>
        )}

        {/* --- Firmas --- */}
        <section className="space-y-3 rounded-md border p-4">
          <h3 className="font-semibold">Firmas</h3>
          <ul className="space-y-1 text-sm">
            {contract.signers.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span>
                  {SIGNER_ROLE_LABELS[s.role]} — {s.fullName}
                </span>
                <span className="text-muted-foreground">
                  {s.signedAt ? `✓ ${formatBogota(s.signedAt)}` : 'pendiente'}
                </span>
              </li>
            ))}
          </ul>

          {canSignAsRepresentative && (
            <Button size="sm" disabled={busyAction} onClick={() => void signAsRepresentative()}>
              Firmar como representante
            </Button>
          )}
          {canSendToSignatures && (
            <Button size="sm" disabled={busyAction} onClick={() => void sendToSignatures()}>
              Enviar a firmas
            </Button>
          )}
          {canSignAsAdopter && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Dibuja o sube tu firma para firmar el contrato:
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={captureMode === 'draw' ? 'default' : 'outline'}
                  onClick={() => {
                    setCaptureMode('draw');
                    setSignatureBase64(null);
                  }}
                >
                  Dibujar firma
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={captureMode === 'upload' ? 'default' : 'outline'}
                  onClick={() => {
                    setCaptureMode('upload');
                    setSignatureBase64(null);
                  }}
                >
                  Subir imagen
                </Button>
              </div>
              {captureMode === 'draw' ? (
                <SignaturePad onChange={setSignatureBase64} />
              ) : (
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  aria-label="Subir imagen de la firma"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void fileToBase64(file).then(setSignatureBase64);
                  }}
                  className="block text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
                />
              )}
              {signatureBase64 && (
                <p className="text-xs font-medium text-emerald-600">✓ Firma lista</p>
              )}
              <Button
                size="sm"
                disabled={busyAction || !signatureBase64}
                onClick={() => void signAsAdopter()}
              >
                Firmar
              </Button>
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
