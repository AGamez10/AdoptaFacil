// Module: custody (documentación, ingreso, custodia y guardería de animales).
//
// La organización documenta lo que ocurre con cada animal bajo su cuidado:
// el ingreso (acta), el contrato de guardería, los cobros y pagos, las
// prórrogas, las novedades y la salida. Los documentos se GENERAN a partir de
// estos registros y quedan en el historial del animal.
//
// Regla de negocio obligatoria: una deuda NO retiene al animal. Por eso hay
// cuatro estados independientes y ninguno depende de otro:
//   - cuenta      (`CustodyAccountStatus`): lo que se debe y sus vencimientos.
//   - contrato    (`CustodyContractStatus`): el vínculo contractual.
//   - custodia    (`CustodyStatus`): si el animal está bajo cuidado de la org.
//   - bienestar   (`Animal.status` y el expediente clínico de M03).
// Ningún incumplimiento de pago cambia la custodia ni ordena una entrega: eso
// lo decide siempre una persona.
//
// Las fechas "de calendario" (vencimientos, pagos, inicio y fin de contrato)
// son `YYYY-MM-DD` en hora de Colombia. Los instantes (ingreso, salida,
// creación) son ISO UTC.

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export const CUSTODY_ID_TYPES = ['CC', 'CE', 'NIT', 'PA', 'TI', 'OTRO'] as const;
export type CustodyIdType = (typeof CUSTODY_ID_TYPES)[number];

export const CUSTODY_ID_TYPE_LABELS: Record<CustodyIdType, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  NIT: 'NIT',
  PA: 'Pasaporte',
  TI: 'Tarjeta de identidad',
  OTRO: 'Otro documento',
};

/** Estado de vacunación o desparasitación INFORMADO al ingreso (no es un diagnóstico). */
export const CUSTODY_PREVENTIVE_STATUSES = ['unknown', 'up_to_date', 'incomplete', 'none'] as const;
export type CustodyPreventiveStatus = (typeof CUSTODY_PREVENTIVE_STATUSES)[number];

export const CUSTODY_PREVENTIVE_STATUS_LABELS: Record<CustodyPreventiveStatus, string> = {
  unknown: 'Sin información',
  up_to_date: 'Al día, según lo informado',
  incomplete: 'Incompleto, según lo informado',
  none: 'Sin aplicar, según lo informado',
};

export const CUSTODY_INTAKE_REASONS = [
  'boarding',
  'rescue',
  'owner_surrender',
  'transfer',
  'found',
  'return',
  'other',
] as const;
export type CustodyIntakeReason = (typeof CUSTODY_INTAKE_REASONS)[number];

export const CUSTODY_INTAKE_REASON_LABELS: Record<CustodyIntakeReason, string> = {
  boarding: 'Guardería o custodia temporal',
  rescue: 'Rescate',
  owner_surrender: 'Entrega por su responsable',
  transfer: 'Traslado desde otra organización',
  found: 'Animal encontrado',
  return: 'Devolución de adopción u hogar de paso',
  other: 'Otro motivo',
};

export type CustodyIntakeStatus = 'draft' | 'finalized';

/** Si el animal está bajo cuidado de la organización. Nunca depende de la cuenta. */
export type CustodyStatus = 'not_registered' | 'in_custody' | 'released';

export const CUSTODY_STATUS_LABELS: Record<CustodyStatus, string> = {
  not_registered: 'Sin ingreso registrado',
  in_custody: 'Bajo custodia',
  released: 'Entregado',
};

export type CustodyContractStatus = 'draft' | 'issued' | 'active' | 'ended' | 'cancelled';

export const CUSTODY_CONTRACT_STATUS_LABELS: Record<CustodyContractStatus, string> = {
  draft: 'Borrador',
  issued: 'Emitido, pendiente de firma',
  active: 'Vigente',
  ended: 'Terminado',
  cancelled: 'Anulado',
};

export const CUSTODY_PAYMENT_FREQUENCIES = ['monthly', 'biweekly', 'weekly', 'one_time'] as const;
export type CustodyPaymentFrequency = (typeof CUSTODY_PAYMENT_FREQUENCIES)[number];

export const CUSTODY_PAYMENT_FREQUENCY_LABELS: Record<CustodyPaymentFrequency, string> = {
  monthly: 'Mensual',
  biweekly: 'Quincenal',
  weekly: 'Semanal',
  one_time: 'Pago único',
};

/** Conceptos de cobro al responsable. Nunca son donaciones. */
export const CUSTODY_CHARGE_CONCEPTS = [
  'boarding_fee',
  'food',
  'veterinary',
  'transport',
  'late_fee',
  'other',
] as const;
export type CustodyChargeConcept = (typeof CUSTODY_CHARGE_CONCEPTS)[number];

export const CUSTODY_CHARGE_CONCEPT_LABELS: Record<CustodyChargeConcept, string> = {
  boarding_fee: 'Servicio de guardería',
  food: 'Alimentación',
  veterinary: 'Atención veterinaria',
  transport: 'Transporte',
  late_fee: 'Recargo por mora',
  other: 'Otro gasto',
};

export type CustodyChargeStatus = 'pending' | 'paid' | 'cancelled';

/**
 * Situación de un cobro frente a su fecha (calculada al leer, hora Colombia):
 * - `overdue`: venció la fecha original y no hay prórroga vigente.
 * - `extended`: hay una prórroga concedida y aún no vence.
 * - `extension_breached`: venció también la fecha de la prórroga.
 */
export type CustodyChargeSituation =
  'paid' | 'cancelled' | 'upcoming' | 'due_today' | 'overdue' | 'extended' | 'extension_breached';

export const CUSTODY_CHARGE_SITUATION_LABELS: Record<CustodyChargeSituation, string> = {
  paid: 'Pagado',
  cancelled: 'Anulado',
  upcoming: 'Por vencer',
  due_today: 'Vence hoy',
  overdue: 'Vencido',
  extended: 'Con prórroga',
  extension_breached: 'Prórroga incumplida',
};

export type CustodyAccountStatus = 'no_charges' | 'up_to_date' | 'pending' | 'overdue';

export const CUSTODY_ACCOUNT_STATUS_LABELS: Record<CustodyAccountStatus, string> = {
  no_charges: 'Sin cobros',
  up_to_date: 'Al día',
  pending: 'Con saldo por vencer',
  overdue: 'Con saldo vencido',
};

export const CUSTODY_PAYMENT_METHODS = ['transfer', 'deposit', 'cash', 'other'] as const;
export type CustodyPaymentMethod = (typeof CUSTODY_PAYMENT_METHODS)[number];

export const CUSTODY_PAYMENT_METHOD_LABELS: Record<CustodyPaymentMethod, string> = {
  transfer: 'Transferencia',
  deposit: 'Consignación',
  cash: 'Efectivo',
  other: 'Otro medio',
};

export const CUSTODY_RELEASE_TYPES = [
  'return_to_responsible',
  'adoption',
  'transfer_to_organization',
  'handover_to_authority',
  'death',
  'other',
] as const;
export type CustodyReleaseType = (typeof CUSTODY_RELEASE_TYPES)[number];

export const CUSTODY_RELEASE_TYPE_LABELS: Record<CustodyReleaseType, string> = {
  return_to_responsible: 'Devolución a su responsable',
  adoption: 'Entrega en adopción',
  transfer_to_organization: 'Traslado a otra organización',
  handover_to_authority: 'Entrega a una autoridad competente',
  death: 'Fallecimiento',
  other: 'Otra salida',
};

/**
 * Tipos de documento. Cada uno es una cosa distinta y se rotula como lo que
 * es: una constancia de pago NUNCA es una factura electrónica, y un registro
 * de observaciones de ingreso NUNCA es una historia clínica.
 */
export const CUSTODY_DOCUMENT_KINDS = [
  // Generados por AdoptaFácil a partir de los registros.
  'intake_record',
  'boarding_contract',
  'payment_receipt',
  'payment_extension',
  'release_record',
  'animal_report',
  'account_statement',
  // Adjuntos externos.
  'signed_contract',
  'signed_record',
  'bank_proof',
  'expense_support',
  'intake_photo',
  'evidence_photo',
  'vet_assessment',
  'clinical_history',
  'accounting_document',
  'electronic_invoice',
  'donation_support',
  'identity_document',
  'other',
] as const;
export type CustodyDocumentKind = (typeof CUSTODY_DOCUMENT_KINDS)[number];

export const CUSTODY_DOCUMENT_KIND_LABELS: Record<CustodyDocumentKind, string> = {
  intake_record: 'Acta de ingreso y recepción',
  boarding_contract: 'Contrato de guardería y custodia temporal',
  payment_receipt: 'Constancia de recepción de pago',
  payment_extension: 'Registro de prórroga de pago',
  release_record: 'Acta de entrega o salida',
  animal_report: 'Reporte individual del animal',
  account_statement: 'Estado de cuenta',
  signed_contract: 'Contrato firmado',
  signed_record: 'Acta firmada',
  bank_proof: 'Comprobante bancario',
  expense_support: 'Soporte de gasto',
  intake_photo: 'Fotografía de ingreso',
  evidence_photo: 'Fotografía o evidencia',
  vet_assessment: 'Valoración veterinaria (documento del profesional)',
  clinical_history: 'Historia clínica veterinaria (documento del profesional)',
  accounting_document: 'Documento contable',
  electronic_invoice: 'Factura electrónica (emitida fuera de AdoptaFácil)',
  donation_support: 'Soporte de donación',
  identity_document: 'Documento de identidad',
  other: 'Otro documento',
};

/** Tipos que la organización puede adjuntar a mano. */
export const CUSTODY_UPLOADABLE_DOCUMENT_KINDS: readonly CustodyDocumentKind[] = [
  'signed_contract',
  'signed_record',
  'bank_proof',
  'expense_support',
  'intake_photo',
  'evidence_photo',
  'vet_assessment',
  'clinical_history',
  'accounting_document',
  'electronic_invoice',
  'donation_support',
  'identity_document',
  'other',
];

export type CustodyDocumentSource = 'generated' | 'uploaded';

/** Aviso fijo de las constancias: no son documentos tributarios. */
export const CUSTODY_RECEIPT_NOTICE =
  'Esta constancia deja registro de que la organización recibió el pago. No es una factura electrónica ni un documento equivalente, y no reemplaza la factura cuando la organización esté obligada a expedirla.';

/** Aviso fijo del acta de ingreso: observaciones, no diagnósticos. */
export const CUSTODY_INTAKE_NOTICE =
  'Las condiciones descritas son observaciones visibles hechas por la organización al recibir al animal. No son un diagnóstico ni una valoración veterinaria. Los diagnósticos corresponden a un médico veterinario y constan en sus propios documentos.';

/** Regla que acompaña todo documento de cobro o de salida. */
export const CUSTODY_DEBT_SEPARATION_NOTICE =
  'La entrega o devolución del animal no depende del pago de saldos pendientes. Las obligaciones económicas se cobran por las vías que correspondan y el animal no es garantía de ninguna deuda.';

export const CUSTODY_EVENT_TYPES = [
  'intake_recorded',
  'intake_finalized',
  'contract_issued',
  'contract_signed',
  'contract_ended',
  'contract_cancelled',
  'charge_created',
  'charge_cancelled',
  'payment_received',
  'payment_voided',
  'extension_granted',
  'collection_procedure_started',
  'document_generated',
  'document_attached',
  'release_recorded',
  'incident',
  'note',
] as const;
export type CustodyEventType = (typeof CUSTODY_EVENT_TYPES)[number];

export const CUSTODY_EVENT_TYPE_LABELS: Record<CustodyEventType, string> = {
  intake_recorded: 'Ingreso registrado',
  intake_finalized: 'Acta de ingreso generada',
  contract_issued: 'Contrato emitido',
  contract_signed: 'Contrato firmado adjuntado',
  contract_ended: 'Contrato terminado',
  contract_cancelled: 'Contrato anulado',
  charge_created: 'Cobro registrado',
  charge_cancelled: 'Cobro anulado',
  payment_received: 'Pago recibido',
  payment_voided: 'Pago anulado',
  extension_granted: 'Prórroga concedida',
  collection_procedure_started: 'Procedimiento de cobro iniciado',
  document_generated: 'Documento generado',
  document_attached: 'Documento adjuntado',
  release_recorded: 'Salida registrada',
  incident: 'Novedad o incidente',
  note: 'Nota',
};

/** Novedades que una persona registra a mano. */
export const CUSTODY_MANUAL_EVENT_TYPES: readonly CustodyEventType[] = ['incident', 'note'];

// Límites de texto (los valida la API y los usa el formulario).
export const CUSTODY_NAME_MAX = 160;
export const CUSTODY_SHORT_TEXT_MAX = 300;
export const CUSTODY_LONG_TEXT_MAX = 3000;
export const CUSTODY_MAX_AMOUNT_COP = 1_000_000_000;
export const CUSTODY_CLAUSE_TITLE_MAX = 120;
export const CUSTODY_CLAUSE_BODY_MAX = 4000;
export const CUSTODY_MAX_CLAUSES = 60;
export const CUSTODY_REASON_MIN = 5;

// ---------------------------------------------------------------------------
// Responsables
// ---------------------------------------------------------------------------

/** Persona que entrega al animal, lo tiene a su cargo o responde por los pagos. */
export interface CustodyResponsible {
  id: string;
  fullName: string;
  documentType: CustodyIdType;
  documentNumber: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCustodyResponsibleInput {
  fullName: string;
  documentType: CustodyIdType;
  documentNumber: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Ingreso
// ---------------------------------------------------------------------------

export interface CustodyIntake {
  id: string;
  animalId: string;
  status: CustodyIntakeStatus;
  /** ISO UTC. */
  intakeAt: string;
  reason: CustodyIntakeReason;
  reasonDetail?: string;
  /** Procedencia: de dónde viene el animal. */
  origin?: string;
  responsible?: CustodyResponsible;
  /** Lo que la organización VE al recibirlo. No es un diagnóstico. */
  physicalCondition: string;
  /** Cicatrices, lesiones visibles, amputaciones, movilidad, orejas, etc. */
  particularFeatures?: string;
  vaccinationStatus: CustodyPreventiveStatus;
  dewormingStatus: CustodyPreventiveStatus;
  preventiveNotes?: string;
  foodProvided?: string;
  /** Lo que INFORMA quien entrega; la organización no lo valida. */
  medicationsReported?: string;
  notes?: string;
  receivedByName: string;
  /** Valoración veterinaria que trae el animal (documento de un profesional). */
  hasVetAssessment: boolean;
  vetName?: string;
  vetLicense?: string;
  /** `YYYY-MM-DD`. */
  vetAssessmentDate?: string;
  /** Registro hecho después de los hechos, con su procedencia. */
  isRetrospective: boolean;
  retrospectiveSource?: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCustodyIntakeInput {
  intakeAt: string;
  reason: CustodyIntakeReason;
  reasonDetail?: string;
  origin?: string;
  responsibleId?: string;
  physicalCondition: string;
  particularFeatures?: string;
  vaccinationStatus: CustodyPreventiveStatus;
  dewormingStatus: CustodyPreventiveStatus;
  preventiveNotes?: string;
  foodProvided?: string;
  medicationsReported?: string;
  notes?: string;
  receivedByName: string;
  hasVetAssessment: boolean;
  vetName?: string;
  vetLicense?: string;
  vetAssessmentDate?: string;
  isRetrospective?: boolean;
  retrospectiveSource?: string;
}

// ---------------------------------------------------------------------------
// Plantillas y contratos
// ---------------------------------------------------------------------------

export interface CustodyClause {
  /** Estable dentro de la plantilla (para conservar el orden al editar). */
  id: string;
  title: string;
  /** Admite variables `{{...}}` de `CUSTODY_TEMPLATE_VARIABLES`. */
  body: string;
  enabled: boolean;
  /** No se puede quitar ni editar: separación entre deuda y bienestar animal. */
  locked?: boolean;
}

export interface CustodyContractTemplate {
  /** Identifica la plantilla a través de sus versiones. */
  templateKey: string;
  version: number;
  name: string;
  /** `true` en la plantilla base de AdoptaFácil (no editable, se copia). */
  isBase: boolean;
  clauses: CustodyClause[];
  annexes: string[];
  archived: boolean;
  createdAt?: string;
  createdByName?: string;
}

export interface SaveCustodyContractTemplateInput {
  name: string;
  clauses: CustodyClause[];
  annexes: string[];
}

/** Variables que el contrato reemplaza al emitirse. */
export const CUSTODY_TEMPLATE_VARIABLES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'organizacion', label: 'Nombre de la organización' },
  { key: 'responsable', label: 'Nombre del responsable' },
  { key: 'animal', label: 'Nombre del animal' },
  { key: 'valor_mensual', label: 'Valor del servicio' },
  { key: 'valor_alimentacion', label: 'Valor de la alimentación' },
  { key: 'frecuencia_pago', label: 'Frecuencia de pago' },
  { key: 'dia_pago', label: 'Día de pago' },
  { key: 'dias_gracia', label: 'Días de gracia' },
  { key: 'dias_retiro', label: 'Días para retirar al animal' },
  { key: 'dias_aviso', label: 'Días de aviso para terminar' },
  { key: 'fecha_inicio', label: 'Fecha de inicio' },
  { key: 'fecha_fin', label: 'Fecha de finalización' },
  { key: 'ciudad', label: 'Ciudad del servicio' },
];

export interface CustodyContractParty {
  fullName: string;
  documentType: string;
  documentNumber: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
}

export interface CustodyContractRepresentative {
  fullName: string;
  documentType: string;
  documentNumber: string;
  position: string;
}

export interface CustodyContract {
  id: string;
  number: string;
  animalId: string;
  animalName: string;
  status: CustodyContractStatus;
  responsible: CustodyResponsible;
  representative: CustodyContractRepresentative;
  templateName: string;
  templateKey?: string;
  templateVersion?: number;
  /** `YYYY-MM-DD`. */
  startDate: string;
  endDate?: string;
  monthlyFeeCop: number;
  foodFeeCop?: number;
  paymentFrequency: CustodyPaymentFrequency;
  /** Día del mes (1–28) en que vence cada pago, si aplica. */
  paymentDay?: number;
  graceDays: number;
  pickupDays: number;
  noticeDays: number;
  serviceCity?: string;
  paymentConditions?: string;
  observations?: string;
  clauses: CustodyClause[];
  annexes: string[];
  issuedAt?: string;
  signedAt?: string;
  endedAt?: string;
  endReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCustodyContractInput {
  animalId: string;
  responsibleId: string;
  representative: CustodyContractRepresentative;
  /** Plantilla de la organización o la base; si falta, se usa la base. */
  templateKey?: string;
  startDate: string;
  endDate?: string;
  monthlyFeeCop: number;
  foodFeeCop?: number;
  paymentFrequency: CustodyPaymentFrequency;
  paymentDay?: number;
  graceDays?: number;
  pickupDays?: number;
  noticeDays?: number;
  serviceCity?: string;
  paymentConditions?: string;
  observations?: string;
  /** Cláusulas ajustadas para ESTE contrato (parten de la plantilla). */
  clauses?: CustodyClause[];
  annexes?: string[];
}

/** Datos ya registrados que el formulario del contrato no vuelve a pedir. */
export interface CustodyContractPrefill {
  organization: {
    name: string;
    legalName?: string;
    nit?: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
  };
  representative?: CustodyContractRepresentative;
  animal: {
    id: string;
    name: string;
    species: string;
    sex: string;
    breed?: string;
    ageLabel?: string;
  };
  /** Responsable del último ingreso del animal, si lo hay. */
  responsible?: CustodyResponsible;
  /** Lo que falta para poder EMITIR el contrato, en palabras del usuario. */
  missing: CustodyMissingField[];
}

/** Un dato obligatorio que falta antes de generar un documento. */
export interface CustodyMissingField {
  field: string;
  /** Qué completar y dónde, en español. */
  message: string;
}

// ---------------------------------------------------------------------------
// Cuenta: cobros, pagos y prórrogas
// ---------------------------------------------------------------------------

export interface CustodyChargeExtension {
  id: string;
  /** `YYYY-MM-DD`. */
  previousDueDate: string;
  newDueDate: string;
  reason: string;
  /** Quién la pidió (el responsable, casi siempre). */
  requestedBy?: string;
  authorizedByName: string;
  createdAt: string;
}

export interface CustodyPayment {
  id: string;
  chargeId: string;
  receiptNumber: string;
  amountCop: number;
  /** `YYYY-MM-DD`. */
  paidOn: string;
  method: CustodyPaymentMethod;
  reference?: string;
  notes?: string;
  receivedByName: string;
  hasProof: boolean;
  /** Constancia generada (documento del historial). */
  receiptDocumentId?: string;
  proofDocumentId?: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
}

export interface CustodyCharge {
  id: string;
  animalId: string;
  animalName: string;
  responsibleId: string;
  responsibleName: string;
  contractId?: string;
  contractNumber?: string;
  concept: CustodyChargeConcept;
  description: string;
  amountCop: number;
  paidCop: number;
  balanceCop: number;
  /** Fecha de vencimiento ORIGINAL. Una prórroga no la cambia. */
  dueDate: string;
  /** La fecha que rige hoy: la de la última prórroga, o la original. */
  effectiveDueDate: string;
  /** Fecha del gasto, cuando el cobro reembolsa algo que la org pagó. */
  expenseDate?: string;
  periodLabel?: string;
  status: CustodyChargeStatus;
  situation: CustodyChargeSituation;
  /** Días de atraso frente a `effectiveDueDate` (0 si no hay atraso). */
  daysOverdue: number;
  hasSupport: boolean;
  supportDocumentId?: string;
  extensions: CustodyChargeExtension[];
  payments: CustodyPayment[];
  /** Una persona decidió iniciar el cobro formal (nunca es automático). */
  collectionStartedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface CreateCustodyChargeInput {
  animalId: string;
  responsibleId: string;
  contractId?: string;
  concept: CustodyChargeConcept;
  description: string;
  amountCop: number;
  dueDate: string;
  expenseDate?: string;
  periodLabel?: string;
}

export interface RegisterCustodyPaymentInput {
  amountCop: number;
  paidOn: string;
  method: CustodyPaymentMethod;
  reference?: string;
  notes?: string;
}

export interface GrantCustodyExtensionInput {
  newDueDate: string;
  reason: string;
  requestedBy?: string;
}

/** Aviso calculado al leer: un cobro que pasó su fecha sin pago registrado. */
export interface CustodyAlert {
  /** `custody:<chargeId>:<effectiveDueDate>`: cambia si se concede una prórroga. */
  key: string;
  kind: 'payment_overdue' | 'extension_breached';
  chargeId: string;
  animalId: string;
  animalName: string;
  responsibleName: string;
  description: string;
  balanceCop: number;
  effectiveDueDate: string;
  daysOverdue: number;
}

export interface CustodyBalanceLine {
  id: string;
  name: string;
  pendingCop: number;
  overdueCop: number;
  paidCop: number;
  openCharges: number;
}

export interface CustodyAccountSummary {
  pendingCop: number;
  overdueCop: number;
  paidCop: number;
  byResponsible: CustodyBalanceLine[];
  byAnimal: CustodyBalanceLine[];
  alerts: CustodyAlert[];
}

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

export interface CustodyRelease {
  id: string;
  animalId: string;
  releaseType: CustodyReleaseType;
  /** ISO UTC. */
  releasedAt: string;
  receivedByName: string;
  receivedByDocument?: string;
  receivedByPhone?: string;
  receivedByRelation?: string;
  conditionAtRelease: string;
  notes?: string;
  deliveredByName: string;
  /** Solo en entrega a autoridad: quién decidió, a qué autoridad y por qué. */
  authorityName?: string;
  authorityBasis?: string;
  decidedByName?: string;
  /** Saldo pendiente al salir. Es informativo: nunca impide la salida. */
  outstandingBalanceCop: number;
  isRetrospective: boolean;
  retrospectiveSource?: string;
  createdAt: string;
}

export interface CreateCustodyReleaseInput {
  releaseType: CustodyReleaseType;
  releasedAt: string;
  receivedByName: string;
  receivedByDocument?: string;
  receivedByPhone?: string;
  receivedByRelation?: string;
  conditionAtRelease: string;
  notes?: string;
  deliveredByName: string;
  authorityName?: string;
  authorityBasis?: string;
  /** Obligatorio en entrega a autoridad: confirma que una persona lo revisó y decidió. */
  humanReviewConfirmed?: boolean;
  isRetrospective?: boolean;
  retrospectiveSource?: string;
}

// ---------------------------------------------------------------------------
// Documentos e historial
// ---------------------------------------------------------------------------

export interface CustodyDocument {
  id: string;
  animalId?: string;
  kind: CustodyDocumentKind;
  title: string;
  source: CustodyDocumentSource;
  contentType: string;
  sizeBytes: number;
  /** SHA-256 del archivo guardado: prueba de que no cambió. */
  sha256: string;
  version: number;
  /** `YYYY-MM-DD`: fecha del documento (puede ser anterior a la carga). */
  documentDate?: string;
  isRetrospective: boolean;
  retrospectiveSource?: string;
  intakeId?: string;
  contractId?: string;
  chargeId?: string;
  paymentId?: string;
  releaseId?: string;
  createdByName: string;
  createdAt: string;
}

export interface CustodyEvent {
  id: string;
  animalId: string;
  type: CustodyEventType;
  summary: string;
  detail?: string;
  /** Cuándo ocurrió (ISO UTC). */
  occurredAt: string;
  /** Cuándo se registró (ISO UTC). */
  recordedAt: string;
  actorName: string;
  isRetrospective: boolean;
  retrospectiveSource?: string;
  documentId?: string;
}

export interface CreateCustodyEventInput {
  type: 'incident' | 'note';
  summary: string;
  detail?: string;
  occurredAt: string;
  /** En un incidente: si ya se avisó al responsable. */
  responsibleNotified?: boolean;
  isRetrospective?: boolean;
  retrospectiveSource?: string;
}

/** Los cuatro estados de un animal, cada uno por su lado. */
export interface CustodyOverview {
  animalId: string;
  custodyStatus: CustodyStatus;
  contractStatus: CustodyContractStatus | 'none';
  accountStatus: CustodyAccountStatus;
  /** `Animal.status` (bienestar y disponibilidad, de M03). */
  welfareStatus: string;
  pendingCop: number;
  overdueCop: number;
  latestIntake?: CustodyIntake;
  currentContract?: CustodyContract;
  latestRelease?: CustodyRelease;
  /** Fecha de ingreso para los reportes (del acta o, si no hay, del registro). */
  intakeDate: string;
  intakeDateSource: 'intake_record' | 'system_record';
}

// ---------------------------------------------------------------------------
// Reportes de animales
// ---------------------------------------------------------------------------

export interface AnimalReportFilters {
  status?: string;
  species?: string;
  sex?: string;
  custody?: CustodyStatus;
  /** `YYYY-MM-DD`, sobre la fecha de ingreso. */
  intakeFrom?: string;
  intakeTo?: string;
  includeInactive?: boolean;
  search?: string;
}

export interface AnimalReportRow {
  id: string;
  code: string;
  name: string;
  species: string;
  sex: string;
  breed?: string;
  ageLabel: string;
  status: string;
  isActive: boolean;
  intakeDate: string;
  intakeDateSource: 'intake_record' | 'system_record';
  custodyStatus: CustodyStatus;
  origin?: string;
  responsibleName?: string;
  notes?: string;
  photoUrl?: string;
}

export interface AnimalReportPreview {
  total: number;
  rows: AnimalReportRow[];
  /** Máximo de animales por reporte consolidado. */
  limit: number;
  truncated: boolean;
}

export const ANIMAL_REPORT_MAX_ROWS = 5000;
/** Hasta cuántos animales lleva foto el PDF consolidado (memoria y tiempo). */
export const ANIMAL_REPORT_PHOTO_LIMIT = 400;

// ---------------------------------------------------------------------------
// Plantilla base del contrato de guardería
// ---------------------------------------------------------------------------

export const CUSTODY_BASE_TEMPLATE_KEY = 'base-guarderia-v1';

/**
 * Plantilla base de AdoptaFácil para el contrato de guardería y custodia
 * temporal. Recoge la estructura que usan las fundaciones (propiedad,
 * requisitos sanitarios, alimentación, atención veterinaria, novedades,
 * pagos, mora y terminación) con dos cambios de fondo:
 *
 *  - La deuda nunca retiene al animal (cláusula bloqueada).
 *  - Entregar el animal a una autoridad no es automático: exige revisión y
 *    decisión de la organización según el procedimiento que aplique.
 *
 * TODO(client): el texto es una base operativa. Cada organización debe
 * revisarlo con su asesor jurídico antes de usarlo.
 */
export const CUSTODY_BASE_TEMPLATE: CustodyContractTemplate = {
  templateKey: CUSTODY_BASE_TEMPLATE_KEY,
  version: 1,
  name: 'Guardería y custodia temporal (base)',
  isBase: true,
  archived: false,
  annexes: [
    'Copia del documento de identidad de quienes firman.',
    'Copia del carné de vacunación o certificado veterinario del animal, si existe.',
    'Acta de ingreso y recepción del animal.',
  ],
  clauses: [
    {
      id: 'objeto',
      title: 'Objeto',
      body: '{{organizacion}} presta a {{responsable}} el servicio de guardería y custodia temporal de {{animal}}, en {{ciudad}}, desde el {{fecha_inicio}} y hasta el {{fecha_fin}}, en las condiciones de este contrato.',
      enabled: true,
    },
    {
      id: 'responsable',
      title: 'Calidad del responsable',
      body: 'El responsable declara que es propietario o tenedor del animal, o que está autorizado por quien lo es, para entregarlo en custodia.',
      enabled: true,
    },
    {
      id: 'sanidad',
      title: 'Condiciones sanitarias de ingreso',
      body: 'El responsable entrega, cuando exista, copia del carné de vacunación y de los exámenes o certificados veterinarios recientes del animal, y mantiene vigente su control de parásitos externos e internos. Las condiciones visibles del animal al llegar constan en el acta de ingreso, que hace parte de este contrato.',
      enabled: true,
    },
    {
      id: 'alimentacion',
      title: 'Alimentación',
      body: 'El responsable suministra el alimento del animal durante su permanencia. Si no lo entrega, la organización lo suministra para mantener la salud y condición del animal, y cobra su valor ({{valor_alimentacion}} por periodo, o el que conste en el soporte) junto con el siguiente pago.',
      enabled: true,
    },
    {
      id: 'atencion-veterinaria',
      title: 'Autorización de atención veterinaria',
      body: 'El responsable autoriza a la organización a acudir a un médico veterinario cuando la salud del animal lo requiera, incluido su aislamiento si presenta una enfermedad contagiosa. Los costos los asume el responsable, contra los soportes del servicio. La organización no emite diagnósticos: estos corresponden al profesional que atienda al animal.',
      enabled: true,
    },
    {
      id: 'novedades',
      title: 'Comunicación de novedades',
      body: 'La organización avisa al responsable, por los datos de contacto de este contrato, cualquier incidente o novedad relevante del animal, y deja registro de ella.',
      enabled: true,
    },
    {
      id: 'cuidado',
      title: 'Obligaciones de la organización',
      body: 'La organización atiende las necesidades de alimentación, descanso, higiene y bienestar del animal y mantiene limpias sus instalaciones. El responsable fue informado de que algunos animales pierden peso o cambian de conducta mientras se adaptan a un entorno nuevo.',
      enabled: true,
    },
    {
      id: 'convivencia',
      title: 'Convivencia con otros animales',
      body: 'El animal comparte espacios vigilados con otros animales. El responsable fue informado de que en esa convivencia pueden presentarse roces, rasguños o mordiscos propios de la socialización. Si el animal causa daños a otro, el responsable asume los gastos que resulten.',
      enabled: true,
    },
    {
      id: 'fallecimiento',
      title: 'Fallecimiento del animal',
      body: 'Si el animal fallece durante su permanencia, la organización lo informa de inmediato al responsable y solicita a un médico veterinario su concepto sobre la causa. Los gastos de ese concepto y de la disposición del cuerpo los asume el responsable, sin perjuicio de las reclamaciones a que haya lugar.',
      enabled: true,
    },
    {
      id: 'valor',
      title: 'Valor y forma de pago',
      body: 'El servicio tiene un valor de {{valor_mensual}}, con pago {{frecuencia_pago}}, exigible el día {{dia_pago}} de cada periodo. Cuando el contrato empieza a mitad de periodo se paga la parte proporcional. El pago se hace por los medios que indique la organización, que entrega una constancia de recepción por cada pago.',
      enabled: true,
    },
    {
      id: 'mora',
      title: 'Atraso en el pago y prórrogas',
      body: 'Si el pago no se registra en la fecha pactada y pasan {{dias_gracia}} días de gracia, la obligación queda en mora. La organización puede conceder una prórroga a solicitud del responsable; toda prórroga consta por escrito, con su nueva fecha y quién la autorizó. El atraso faculta a la organización para iniciar el cobro por las vías que correspondan.',
      enabled: true,
    },
    {
      id: 'separacion-deuda',
      title: 'Separación entre las obligaciones económicas y el animal',
      body: 'El animal no es garantía de ninguna obligación económica. La organización no retiene al animal ni condiciona su devolución al pago de saldos pendientes. Las sumas adeudadas se cobran por separado, por las vías legales.',
      enabled: true,
      locked: true,
    },
    {
      id: 'terminacion',
      title: 'Terminación',
      body: 'Cualquiera de las partes puede terminar el contrato avisando a la otra con {{dias_aviso}} días de anticipación al vencimiento del periodo. La organización puede terminarlo además por mora superior a 30 días. Si ninguna parte avisa, el contrato se renueva por un periodo igual.',
      enabled: true,
    },
    {
      id: 'retiro',
      title: 'Entrega y retiro del animal',
      body: 'Terminado el contrato, las partes acuerdan la fecha de retiro, que consta en un acta de entrega. Si el responsable no retira al animal dentro de los {{dias_retiro}} días calendario siguientes, la organización insiste por los datos de contacto registrados y deja constancia de ello. Vencido ese plazo, la organización puede acudir a la autoridad competente según el procedimiento aplicable. Esa actuación nunca es automática: la revisa y la decide la organización en cada caso.',
      enabled: true,
    },
    {
      id: 'jornadas',
      title: 'Jornadas de adopción',
      body: 'Si el responsable quiere que el animal participe en jornadas de adopción, lo acompaña o delega a alguien durante la jornada y asume los gastos de baño y transporte.',
      enabled: false,
    },
    {
      id: 'datos',
      title: 'Datos personales',
      body: 'La organización trata los datos personales del responsable solo para ejecutar este contrato y cumplir sus obligaciones, conforme a la Ley 1581 de 2012 y a su política de tratamiento.',
      enabled: true,
    },
  ],
};

/** Reemplaza las variables `{{...}}` de una cláusula. Lo desconocido se deja tal cual. */
export function renderCustodyClause(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

/** Variables `{{...}}` que una cláusula usa y el contrato no conoce. */
export function unknownCustodyVariables(body: string): string[] {
  const known = new Set(CUSTODY_TEMPLATE_VARIABLES.map((v) => v.key));
  const found = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    if (!known.has(match[1])) found.add(match[1]);
  }
  return [...found];
}

/**
 * Situación de un cobro frente a hoy. `effectiveDueDate` ya considera la
 * última prórroga; `hasExtension` distingue "vencido" de "prórroga incumplida".
 */
export function custodyChargeSituation(input: {
  status: CustodyChargeStatus;
  effectiveDueDate: string;
  hasExtension: boolean;
  graceDays?: number;
  today: string;
}): { situation: CustodyChargeSituation; daysOverdue: number } {
  if (input.status === 'paid') return { situation: 'paid', daysOverdue: 0 };
  if (input.status === 'cancelled') return { situation: 'cancelled', daysOverdue: 0 };
  const days = custodyDaysBetween(input.effectiveDueDate, input.today);
  // Los días de gracia solo aplican a la fecha original, no a una prórroga.
  const grace = input.hasExtension ? 0 : Math.max(0, input.graceDays ?? 0);
  if (days > grace) {
    return {
      situation: input.hasExtension ? 'extension_breached' : 'overdue',
      daysOverdue: days,
    };
  }
  if (input.hasExtension) return { situation: 'extended', daysOverdue: 0 };
  return { situation: days === 0 ? 'due_today' : 'upcoming', daysOverdue: 0 };
}

/** Días de calendario de `from` a `to` (`YYYY-MM-DD`); negativo si `to` es anterior. */
export function custodyDaysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
