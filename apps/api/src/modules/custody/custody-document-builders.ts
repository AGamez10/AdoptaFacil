import {
  CUSTODY_CHARGE_CONCEPT_LABELS,
  CUSTODY_CHARGE_SITUATION_LABELS,
  CUSTODY_CONTRACT_STATUS_LABELS,
  CUSTODY_DEBT_SEPARATION_NOTICE,
  CUSTODY_DOCUMENT_KIND_LABELS,
  CUSTODY_EVENT_TYPE_LABELS,
  CUSTODY_ID_TYPE_LABELS,
  CUSTODY_INTAKE_NOTICE,
  CUSTODY_INTAKE_REASON_LABELS,
  CUSTODY_PAYMENT_FREQUENCY_LABELS,
  CUSTODY_PAYMENT_METHOD_LABELS,
  CUSTODY_PREVENTIVE_STATUS_LABELS,
  CUSTODY_RECEIPT_NOTICE,
  CUSTODY_RELEASE_TYPE_LABELS,
  CUSTODY_STATUS_LABELS,
  type AnimalReportRow,
  type CustodyCharge,
  type CustodyChargeExtension,
  type CustodyClause,
  type CustodyContract,
  type CustodyContractParty,
  type CustodyDocument,
  type CustodyEvent,
  type CustodyIdType,
  type CustodyIntake,
  type CustodyPayment,
  type CustodyRelease,
  type CustodyStatus,
  renderCustodyClause,
} from '@adoptafacil/contracts';
import type {
  CustodyPdfBlock,
  CustodyPdfCell,
  CustodyPdfField,
  CustodyPdfOrganization,
  CustodyPdfSpec,
} from './custody-pdf';
import {
  ANIMAL_STATUS_LABELS,
  SEX_LABELS,
  SPECIES_LABELS,
  formatCop,
  formatDateLong,
  formatDateShort,
  formatInstant,
  generatedLabel,
} from './custody.util';

/**
 * Contenido de cada documento institucional. Funciones puras: reciben los
 * registros ya leídos y devuelven la lista de bloques que `renderCustodyPdf`
 * maqueta. Regla común: solo se imprime lo que está registrado. Un dato
 * opcional vacío no aparece; nunca se rellena con un valor supuesto.
 */

/** Datos del animal tal como se imprimen (copiados al emitir). */
export interface AnimalFacts {
  id: string;
  code: string;
  name: string;
  species: string;
  sex: string;
  breed?: string;
  ageLabel?: string;
  status?: string;
}

const RETROSPECTIVE_PREFIX =
  'Registro retrospectivo: se elaboró después de los hechos. Procedencia de la información: ';

function present(fields: Array<CustodyPdfField | null | undefined | false>): CustodyPdfField[] {
  return fields.filter((f): f is CustodyPdfField => Boolean(f && f.value && f.value.trim()));
}

function field(label: string, value: string | undefined | null): CustodyPdfField | null {
  return value && value.trim() ? { label, value: value.trim() } : null;
}

function idLine(type: string | undefined, number: string | undefined): string {
  if (!number) return '';
  const label = CUSTODY_ID_TYPE_LABELS[type as CustodyIdType];
  return label ? `${label} ${number}` : number;
}

function animalFields(animal: AnimalFacts): CustodyPdfField[] {
  return present([
    field('Nombre', animal.name),
    field('Código en AdoptaFácil', animal.code),
    field('Especie', SPECIES_LABELS[animal.species] ?? animal.species),
    field('Sexo', SEX_LABELS[animal.sex] ?? animal.sex),
    field('Raza', animal.breed),
    field('Edad', animal.ageLabel),
  ]);
}

function partyFields(party: CustodyContractParty): CustodyPdfField[] {
  return present([
    field('Nombre', party.fullName),
    field('Identificación', idLine(party.documentType, party.documentNumber)),
    field('Teléfono', party.phone),
    field('Correo', party.email),
    field('Dirección', [party.address, party.city].filter(Boolean).join(', ')),
  ]);
}

function retrospectiveNotice(
  isRetrospective: boolean,
  source: string | undefined,
): CustodyPdfBlock[] {
  return isRetrospective
    ? [{ kind: 'notice', tone: 'warning', text: `${RETROSPECTIVE_PREFIX}${source ?? ''}` }]
    : [];
}

// --- 1. Acta de ingreso y recepción ----------------------------------------

export interface IntakeRecordInput {
  organization: CustodyPdfOrganization;
  animal: AnimalFacts;
  intake: CustodyIntake;
  deliveredBy?: CustodyContractParty;
  photos: Array<{ data: Buffer; caption?: string }>;
  code: string;
  now?: Date;
}

export function buildIntakeRecord(input: IntakeRecordInput): CustodyPdfSpec {
  const { intake } = input;
  const blocks: CustodyPdfBlock[] = [
    ...retrospectiveNotice(intake.isRetrospective, intake.retrospectiveSource),
    { kind: 'heading', text: 'Animal' },
    { kind: 'fields', items: animalFields(input.animal) },
    { kind: 'heading', text: 'Ingreso' },
    {
      kind: 'fields',
      items: present([
        field('Fecha y hora de ingreso', formatInstant(new Date(intake.intakeAt))),
        field(
          'Motivo',
          [CUSTODY_INTAKE_REASON_LABELS[intake.reason], intake.reasonDetail]
            .filter(Boolean)
            .join('. '),
        ),
        field('Procedencia', intake.origin),
        field('Recibe por la organización', intake.receivedByName),
      ]),
    },
  ];

  blocks.push({ kind: 'heading', text: 'Persona que entrega' });
  if (input.deliveredBy) {
    blocks.push({ kind: 'fields', items: partyFields(input.deliveredBy) });
  } else {
    blocks.push({
      kind: 'paragraph',
      muted: true,
      text: 'No se registró una persona que entrega (por ejemplo, un animal encontrado sin responsable).',
    });
  }

  blocks.push(
    { kind: 'heading', text: 'Condiciones observadas por la organización' },
    { kind: 'notice', text: CUSTODY_INTAKE_NOTICE },
    {
      kind: 'fields',
      columns: 1,
      items: present([
        field('Condición física observable', intake.physicalCondition),
        field('Características particulares', intake.particularFeatures),
      ]),
    },
    { kind: 'heading', text: 'Información suministrada por quien entrega' },
    {
      kind: 'fields',
      items: present([
        field('Vacunación', CUSTODY_PREVENTIVE_STATUS_LABELS[intake.vaccinationStatus]),
        field('Desparasitación', CUSTODY_PREVENTIVE_STATUS_LABELS[intake.dewormingStatus]),
      ]),
    },
  );
  const informed = present([
    field('Detalle de vacunación y desparasitación', intake.preventiveNotes),
    field('Alimentación suministrada', intake.foodProvided),
    field('Medicamentos o tratamientos informados', intake.medicationsReported),
  ]);
  if (informed.length > 0) blocks.push({ kind: 'fields', columns: 1, items: informed });

  blocks.push({ kind: 'heading', text: 'Valoración veterinaria' });
  if (intake.hasVetAssessment) {
    blocks.push(
      {
        kind: 'fields',
        items: present([
          field('Profesional', intake.vetName),
          field('Tarjeta profesional', intake.vetLicense),
          field(
            'Fecha de la valoración',
            intake.vetAssessmentDate ? formatDateLong(intake.vetAssessmentDate) : undefined,
          ),
        ]),
      },
      {
        kind: 'paragraph',
        muted: true,
        text: 'El animal ingresa con una valoración hecha por un médico veterinario. Su contenido consta en el documento del profesional, que se conserva en el historial del animal. Esta acta no lo resume ni lo interpreta.',
      },
    );
  } else {
    blocks.push({
      kind: 'paragraph',
      muted: true,
      text: 'El animal ingresa sin valoración veterinaria.',
    });
  }

  if (intake.notes) {
    blocks.push(
      { kind: 'heading', text: 'Observaciones' },
      { kind: 'paragraph', text: intake.notes },
    );
  }
  if (input.photos.length > 0) {
    blocks.push(
      { kind: 'heading', text: 'Fotografías de referencia' },
      { kind: 'photos', images: input.photos },
    );
  }
  blocks.push(
    { kind: 'spacer', size: 8 },
    {
      kind: 'paragraph',
      text: 'Quienes firman dejan constancia de la entrega y la recepción del animal en las condiciones descritas.',
    },
    {
      kind: 'signatures',
      signers: [
        {
          role: 'Entrega',
          name: input.deliveredBy?.fullName ?? '',
          detail: idLine(input.deliveredBy?.documentType, input.deliveredBy?.documentNumber),
        },
        { role: 'Recibe por la organización', name: intake.receivedByName },
      ],
    },
  );

  return {
    organization: input.organization,
    title: 'Acta de ingreso y recepción del animal',
    subtitle: `${input.animal.name} · ${formatInstant(new Date(intake.intakeAt))}`,
    code: input.code,
    generatedLabel: generatedLabel(input.now),
    blocks,
    footerNote: 'Documento administrativo. No es una historia clínica ni contiene diagnósticos.',
  };
}

// --- 2. Contrato de guardería y custodia temporal --------------------------

export interface ContractInput {
  organization: CustodyPdfOrganization;
  animal: AnimalFacts;
  responsible: CustodyContractParty;
  contract: Pick<
    CustodyContract,
    | 'number'
    | 'representative'
    | 'startDate'
    | 'endDate'
    | 'monthlyFeeCop'
    | 'foodFeeCop'
    | 'paymentFrequency'
    | 'paymentDay'
    | 'graceDays'
    | 'pickupDays'
    | 'noticeDays'
    | 'serviceCity'
    | 'paymentConditions'
    | 'observations'
    | 'clauses'
    | 'annexes'
  >;
  draft?: boolean;
  now?: Date;
}

/** Valores de las variables `{{...}}` para ESTE contrato. */
export function contractVariables(input: ContractInput): Record<string, string> {
  const c = input.contract;
  return {
    organizacion: input.organization.legalName || input.organization.name,
    responsable: input.responsible.fullName,
    animal: input.animal.name,
    valor_mensual: formatCop(c.monthlyFeeCop),
    valor_alimentacion:
      c.foodFeeCop !== undefined && c.foodFeeCop !== null
        ? formatCop(c.foodFeeCop)
        : 'el valor del soporte',
    frecuencia_pago: CUSTODY_PAYMENT_FREQUENCY_LABELS[c.paymentFrequency].toLowerCase(),
    dia_pago: c.paymentDay ? String(c.paymentDay) : 'acordado',
    dias_gracia: String(c.graceDays),
    dias_retiro: String(c.pickupDays),
    dias_aviso: String(c.noticeDays),
    fecha_inicio: formatDateLong(c.startDate),
    fecha_fin: c.endDate ? formatDateLong(c.endDate) : 'que las partes lo terminen',
    ciudad: c.serviceCity || input.organization.city || 'el domicilio de la organización',
  };
}

export function enabledClauses(clauses: CustodyClause[]): CustodyClause[] {
  return clauses.filter((clause) => clause.enabled || clause.locked);
}

export function buildContract(input: ContractInput): CustodyPdfSpec {
  const { contract: c, organization: org } = input;
  const variables = contractVariables(input);
  const orgName = org.legalName || org.name;

  const blocks: CustodyPdfBlock[] = [
    { kind: 'heading', text: 'Datos del contrato' },
    {
      kind: 'fields',
      items: present([
        field('Prestador del servicio', orgName),
        field('NIT', org.nit),
        field('Domicilio', [org.address, org.city].filter(Boolean).join(', ')),
        field('Contacto', [org.phone, org.email].filter(Boolean).join(' · ')),
        field(
          'Firma por la organización',
          `${c.representative.fullName}, ${c.representative.position}`,
        ),
        field(
          'Identificación de quien firma',
          idLine(c.representative.documentType, c.representative.documentNumber),
        ),
      ]),
    },
    { kind: 'heading', text: 'Responsable del animal' },
    { kind: 'fields', items: partyFields(input.responsible) },
    { kind: 'heading', text: 'Animal' },
    { kind: 'fields', items: animalFields(input.animal) },
    { kind: 'heading', text: 'Condiciones del servicio' },
    {
      kind: 'fields',
      items: present([
        field('Fecha de inicio', formatDateLong(c.startDate)),
        field('Fecha de finalización', c.endDate ? formatDateLong(c.endDate) : 'Sin fecha fija'),
        field('Valor del servicio', formatCop(c.monthlyFeeCop)),
        field(
          'Valor de la alimentación',
          c.foodFeeCop !== undefined && c.foodFeeCop !== null ? formatCop(c.foodFeeCop) : undefined,
        ),
        field('Frecuencia de pago', CUSTODY_PAYMENT_FREQUENCY_LABELS[c.paymentFrequency]),
        field('Día de pago', c.paymentDay ? `Día ${c.paymentDay} de cada periodo` : undefined),
        field('Días de gracia', c.graceDays > 0 ? String(c.graceDays) : undefined),
        field('Ciudad del servicio', c.serviceCity),
      ]),
    },
  ];
  if (c.paymentConditions) {
    blocks.push({
      kind: 'fields',
      columns: 1,
      items: [{ label: 'Condiciones de pago', value: c.paymentConditions }],
    });
  }

  blocks.push(
    { kind: 'heading', text: 'Cláusulas' },
    {
      kind: 'paragraph',
      text: `Entre ${orgName}${org.nit ? `, con NIT ${org.nit}` : ''}, representada por ${
        c.representative.fullName
      }, ${idLine(c.representative.documentType, c.representative.documentNumber)}, en calidad de ${
        c.representative.position
      }, en adelante LA ORGANIZACIÓN, y ${input.responsible.fullName}, ${idLine(
        input.responsible.documentType,
        input.responsible.documentNumber,
      )}, en adelante EL RESPONSABLE, se celebra este contrato de prestación de servicios de guardería y custodia temporal, que se rige por las siguientes cláusulas:`,
    },
  );
  enabledClauses(c.clauses).forEach((clause, index) => {
    blocks.push({
      kind: 'clause',
      number: `Cláusula ${index + 1}`,
      title: clause.title,
      text: renderCustodyClause(clause.body, variables),
    });
  });

  if (c.observations) {
    blocks.push(
      { kind: 'heading', text: 'Observaciones' },
      { kind: 'paragraph', text: c.observations },
    );
  }
  if (c.annexes.length > 0) {
    blocks.push(
      { kind: 'heading', text: 'Anexos' },
      { kind: 'paragraph', text: c.annexes.map((annex, i) => `${i + 1}. ${annex}`).join('\n') },
    );
  }
  blocks.push(
    { kind: 'spacer', size: 6 },
    {
      kind: 'paragraph',
      text: 'En constancia, las partes firman este documento en dos ejemplares del mismo contenido.',
    },
    {
      kind: 'signatures',
      signers: [
        {
          role: `LA ORGANIZACIÓN · ${c.representative.position}`,
          name: c.representative.fullName,
          detail: idLine(c.representative.documentType, c.representative.documentNumber),
        },
        {
          role: 'EL RESPONSABLE',
          name: input.responsible.fullName,
          detail: idLine(input.responsible.documentType, input.responsible.documentNumber),
        },
      ],
    },
  );

  return {
    organization: org,
    title: 'Contrato de prestación de servicios de guardería y custodia temporal',
    subtitle: `${input.animal.name} · ${input.responsible.fullName}`,
    code: `Contrato ${c.number}`,
    generatedLabel: generatedLabel(input.now),
    blocks,
    watermark: input.draft ? 'BORRADOR' : undefined,
    footerNote:
      'Documento para firma manuscrita de las partes. AdoptaFácil no certifica firmas electrónicas.',
  };
}

// --- 3. Constancia de recepción de pago ------------------------------------

export interface PaymentReceiptInput {
  organization: CustodyPdfOrganization;
  animal: AnimalFacts;
  responsible: CustodyContractParty;
  charge: Pick<
    CustodyCharge,
    'concept' | 'description' | 'amountCop' | 'dueDate' | 'periodLabel' | 'contractNumber'
  >;
  payment: Pick<
    CustodyPayment,
    'receiptNumber' | 'amountCop' | 'paidOn' | 'method' | 'reference' | 'notes' | 'receivedByName'
  >;
  /** Saldo del cobro después de este pago. */
  balanceAfterCop: number;
  hasProof: boolean;
  now?: Date;
}

export function buildPaymentReceipt(input: PaymentReceiptInput): CustodyPdfSpec {
  const { payment, charge } = input;
  return {
    organization: input.organization,
    title: 'Constancia de recepción de pago',
    subtitle: `Recibido de ${input.responsible.fullName}`,
    code: `Constancia ${payment.receiptNumber}`,
    generatedLabel: generatedLabel(input.now),
    footerNote: 'Constancia administrativa de pago. No es una factura electrónica.',
    blocks: [
      {
        kind: 'paragraph',
        text: `${input.organization.legalName || input.organization.name} deja constancia de que recibió de ${input.responsible.fullName} la suma de ${formatCop(payment.amountCop)}, por el concepto que se detalla a continuación.`,
      },
      { kind: 'heading', text: 'Pago recibido' },
      {
        kind: 'fields',
        items: present([
          field('Valor recibido', formatCop(payment.amountCop)),
          field('Fecha del pago', formatDateLong(payment.paidOn)),
          field('Medio de pago', CUSTODY_PAYMENT_METHOD_LABELS[payment.method]),
          field('Referencia', payment.reference),
          field('Recibe por la organización', payment.receivedByName),
          field(
            'Comprobante bancario',
            input.hasProof ? 'Adjunto en el historial' : 'No se adjuntó',
          ),
        ]),
      },
      { kind: 'heading', text: 'Concepto' },
      {
        kind: 'fields',
        items: present([
          field('Concepto', CUSTODY_CHARGE_CONCEPT_LABELS[charge.concept]),
          field('Descripción', charge.description),
          field('Periodo', charge.periodLabel),
          field('Contrato', charge.contractNumber),
          field('Valor del cobro', formatCop(charge.amountCop)),
          field('Vencimiento original', formatDateLong(charge.dueDate)),
          field(
            'Saldo de este cobro',
            input.balanceAfterCop > 0 ? formatCop(input.balanceAfterCop) : 'Pagado en su totalidad',
          ),
        ]),
      },
      { kind: 'heading', text: 'Quien paga' },
      { kind: 'fields', items: partyFields(input.responsible) },
      { kind: 'heading', text: 'Animal' },
      { kind: 'fields', items: animalFields(input.animal) },
      ...(payment.notes
        ? ([
            { kind: 'heading', text: 'Notas' },
            { kind: 'paragraph', text: payment.notes },
          ] as CustodyPdfBlock[])
        : []),
      { kind: 'notice', tone: 'warning', text: CUSTODY_RECEIPT_NOTICE },
      { kind: 'spacer', size: 10 },
      {
        kind: 'signatures',
        signers: [{ role: 'Recibe por la organización', name: payment.receivedByName }],
      },
    ],
  };
}

// --- 4. Registro de prórroga de pago ----------------------------------------

export interface ExtensionRecordInput {
  organization: CustodyPdfOrganization;
  animal: AnimalFacts;
  responsible: CustodyContractParty;
  charge: Pick<
    CustodyCharge,
    'concept' | 'description' | 'amountCop' | 'dueDate' | 'balanceCop' | 'contractNumber'
  >;
  extension: CustodyChargeExtension;
  /** Cuántas prórrogas lleva este cobro, contando esta. */
  ordinal: number;
  code: string;
  now?: Date;
}

export function buildExtensionRecord(input: ExtensionRecordInput): CustodyPdfSpec {
  const { extension, charge } = input;
  return {
    organization: input.organization,
    title: 'Registro de prórroga de pago',
    subtitle: `${input.responsible.fullName} · ${input.animal.name}`,
    code: input.code,
    generatedLabel: generatedLabel(input.now),
    footerNote: 'Registro administrativo de una decisión de la organización.',
    blocks: [
      {
        kind: 'paragraph',
        text: `La organización concede una prórroga para el pago que se describe a continuación. La fecha de vencimiento original no cambia: esta prórroga fija una nueva fecha de compromiso.`,
      },
      { kind: 'heading', text: 'Prórroga' },
      {
        kind: 'fields',
        items: present([
          field('Fecha que regía', formatDateLong(extension.previousDueDate)),
          field('Nueva fecha de compromiso', formatDateLong(extension.newDueDate)),
          field('Solicitada por', extension.requestedBy),
          field('Autorizada por', extension.authorizedByName),
          field('Fecha de la decisión', formatInstant(new Date(extension.createdAt))),
          field('Prórroga número', String(input.ordinal)),
        ]),
      },
      {
        kind: 'fields',
        columns: 1,
        items: [{ label: 'Motivo', value: extension.reason }],
      },
      { kind: 'heading', text: 'Obligación' },
      {
        kind: 'fields',
        items: present([
          field('Concepto', CUSTODY_CHARGE_CONCEPT_LABELS[charge.concept]),
          field('Descripción', charge.description),
          field('Contrato', charge.contractNumber),
          field('Valor del cobro', formatCop(charge.amountCop)),
          field('Saldo pendiente', formatCop(charge.balanceCop)),
          field('Vencimiento original', formatDateLong(charge.dueDate)),
        ]),
      },
      { kind: 'heading', text: 'Responsable del pago' },
      { kind: 'fields', items: partyFields(input.responsible) },
      { kind: 'notice', text: CUSTODY_DEBT_SEPARATION_NOTICE },
      { kind: 'spacer', size: 10 },
      {
        kind: 'signatures',
        signers: [
          { role: 'Autoriza por la organización', name: extension.authorizedByName },
          { role: 'Responsable del pago', name: input.responsible.fullName },
        ],
      },
    ],
  };
}

// --- 5. Acta de entrega o salida --------------------------------------------

export interface ReleaseRecordInput {
  organization: CustodyPdfOrganization;
  animal: AnimalFacts;
  release: CustodyRelease;
  code: string;
  now?: Date;
}

export function buildReleaseRecord(input: ReleaseRecordInput): CustodyPdfSpec {
  const { release } = input;
  const blocks: CustodyPdfBlock[] = [
    ...retrospectiveNotice(release.isRetrospective, release.retrospectiveSource),
    { kind: 'heading', text: 'Animal' },
    { kind: 'fields', items: animalFields(input.animal) },
    { kind: 'heading', text: 'Salida' },
    {
      kind: 'fields',
      items: present([
        field('Tipo de salida', CUSTODY_RELEASE_TYPE_LABELS[release.releaseType]),
        field('Fecha y hora', formatInstant(new Date(release.releasedAt))),
        field('Entrega por la organización', release.deliveredByName),
      ]),
    },
    { kind: 'heading', text: 'Quien recibe' },
    {
      kind: 'fields',
      items: present([
        field('Nombre', release.receivedByName),
        field('Identificación', release.receivedByDocument),
        field('Teléfono', release.receivedByPhone),
        field('Relación con el animal', release.receivedByRelation),
      ]),
    },
  ];
  if (release.releaseType === 'handover_to_authority') {
    blocks.push(
      { kind: 'heading', text: 'Entrega a autoridad competente' },
      {
        kind: 'fields',
        columns: 1,
        items: present([
          field('Autoridad', release.authorityName),
          field('Fundamento y procedimiento', release.authorityBasis),
          field('Decisión revisada y tomada por', release.decidedByName),
        ]),
      },
    );
  }
  blocks.push(
    { kind: 'heading', text: 'Condición observable al salir' },
    { kind: 'notice', text: CUSTODY_INTAKE_NOTICE },
    { kind: 'paragraph', text: release.conditionAtRelease },
  );
  if (release.notes) {
    blocks.push(
      { kind: 'heading', text: 'Observaciones' },
      { kind: 'paragraph', text: release.notes },
    );
  }
  if (release.outstandingBalanceCop > 0) {
    blocks.push({
      kind: 'notice',
      tone: 'warning',
      text: `Al momento de la salida hay un saldo pendiente de ${formatCop(release.outstandingBalanceCop)}. ${CUSTODY_DEBT_SEPARATION_NOTICE}`,
    });
  }
  blocks.push(
    { kind: 'spacer', size: 10 },
    {
      kind: 'signatures',
      signers: [
        { role: 'Entrega por la organización', name: release.deliveredByName },
        {
          role: 'Recibe',
          name: release.receivedByName,
          detail: release.receivedByDocument,
        },
      ],
    },
  );
  return {
    organization: input.organization,
    title: 'Acta de entrega y salida del animal',
    subtitle: `${input.animal.name} · ${formatInstant(new Date(release.releasedAt))}`,
    code: input.code,
    generatedLabel: generatedLabel(input.now),
    blocks,
    footerNote: 'Documento administrativo de la salida del animal.',
  };
}

// --- 6. Reporte individual --------------------------------------------------

export interface AnimalReportInput {
  organization: CustodyPdfOrganization;
  animal: AnimalFacts & { description?: string; tags?: string[]; size?: string };
  photo?: Buffer | null;
  custodyStatus: CustodyStatus;
  intakeDate: string;
  intakeDateSource: 'intake_record' | 'system_record';
  intakes: CustodyIntake[];
  releases: CustodyRelease[];
  contracts: Array<
    Pick<CustodyContract, 'number' | 'status' | 'startDate' | 'endDate'> & {
      responsibleName: string;
    }
  >;
  documents: CustodyDocument[];
  events: CustodyEvent[];
  code: string;
  now?: Date;
}

export function buildAnimalReport(input: AnimalReportInput): CustodyPdfSpec {
  const latestIntake = input.intakes[0];
  const blocks: CustodyPdfBlock[] = [];
  if (input.photo) {
    blocks.push({ kind: 'photos', images: [{ data: input.photo, caption: input.animal.name }] });
  }
  blocks.push(
    { kind: 'heading', text: 'Identificación' },
    {
      kind: 'fields',
      items: present([
        ...animalFields(input.animal),
        field(
          'Estado actual',
          ANIMAL_STATUS_LABELS[input.animal.status ?? ''] ?? input.animal.status,
        ),
        field('Custodia', CUSTODY_STATUS_LABELS[input.custodyStatus]),
        field(
          'Fecha de ingreso',
          `${formatDateLong(input.intakeDate)}${
            input.intakeDateSource === 'system_record'
              ? ' (fecha de registro en AdoptaFácil; no hay acta de ingreso)'
              : ''
          }`,
        ),
        field('Procedencia', latestIntake?.origin),
        field('Responsable', latestIntake?.responsible?.fullName),
      ]),
    },
  );
  if (input.animal.description) {
    blocks.push(
      { kind: 'heading', text: 'Descripción' },
      { kind: 'paragraph', text: input.animal.description },
    );
  }
  if (latestIntake) {
    blocks.push(
      { kind: 'heading', text: 'Condición de ingreso' },
      { kind: 'notice', text: CUSTODY_INTAKE_NOTICE },
      {
        kind: 'fields',
        columns: 1,
        items: present([
          field('Condición física observable', latestIntake.physicalCondition),
          field('Características particulares', latestIntake.particularFeatures),
          field('Observaciones', latestIntake.notes),
        ]),
      },
    );
  }

  const custodyRows: CustodyPdfCell[][] = [
    ...input.intakes.map((intake) => [
      formatInstant(new Date(intake.intakeAt)),
      `Ingreso${intake.status === 'draft' ? ' (borrador)' : ''}`,
      [CUSTODY_INTAKE_REASON_LABELS[intake.reason], intake.responsible?.fullName]
        .filter(Boolean)
        .join(' · '),
      intake.intakeAt,
    ]),
    ...input.releases.map((release) => [
      formatInstant(new Date(release.releasedAt)),
      'Salida',
      `${CUSTODY_RELEASE_TYPE_LABELS[release.releaseType]} · ${release.receivedByName}`,
      release.releasedAt,
    ]),
  ]
    .sort((a, b) => String(a[3]).localeCompare(String(b[3])))
    .map((row) => row.slice(0, 3));
  blocks.push(
    { kind: 'heading', text: 'Historial de custodia' },
    {
      kind: 'table',
      columns: [
        { header: 'Fecha', width: 0.3 },
        { header: 'Movimiento', width: 0.2 },
        { header: 'Detalle', width: 0.5 },
      ],
      rows: custodyRows,
      empty: 'No hay ingresos ni salidas registrados.',
    },
  );

  if (input.contracts.length > 0) {
    blocks.push(
      { kind: 'heading', text: 'Contratos' },
      {
        kind: 'table',
        columns: [
          { header: 'Número', width: 0.16 },
          { header: 'Estado', width: 0.24 },
          { header: 'Responsable', width: 0.3 },
          { header: 'Vigencia', width: 0.3 },
        ],
        rows: input.contracts.map((contract) => [
          contract.number,
          CUSTODY_CONTRACT_STATUS_LABELS[contract.status],
          contract.responsibleName,
          `${formatDateShort(contract.startDate)} a ${
            contract.endDate ? formatDateShort(contract.endDate) : 'sin fecha fija'
          }`,
        ]),
      },
    );
  }

  blocks.push(
    { kind: 'heading', text: 'Documentos asociados' },
    {
      kind: 'table',
      columns: [
        { header: 'Fecha', width: 0.2 },
        { header: 'Tipo', width: 0.34 },
        { header: 'Título', width: 0.3 },
        { header: 'Registró', width: 0.16 },
      ],
      rows: input.documents.map((doc) => [
        formatInstant(new Date(doc.createdAt)),
        CUSTODY_DOCUMENT_KIND_LABELS[doc.kind],
        doc.title,
        doc.createdByName,
      ]),
      empty: 'No hay documentos en el historial.',
    },
    { kind: 'heading', text: 'Eventos y novedades' },
    {
      kind: 'table',
      columns: [
        { header: 'Ocurrió', width: 0.22 },
        { header: 'Evento', width: 0.22 },
        { header: 'Resumen', width: 0.4 },
        { header: 'Registró', width: 0.16 },
      ],
      rows: input.events.map((event) => [
        formatInstant(new Date(event.occurredAt)),
        `${CUSTODY_EVENT_TYPE_LABELS[event.type]}${event.isRetrospective ? ' (retrospectivo)' : ''}`,
        event.summary,
        event.actorName,
      ]),
      empty: 'No hay eventos registrados.',
    },
  );

  return {
    organization: input.organization,
    title: 'Reporte individual del animal',
    subtitle: `${input.animal.name} · código ${input.animal.code}`,
    code: input.code,
    generatedLabel: generatedLabel(input.now),
    blocks,
    footerNote:
      'Reporte administrativo. No incluye información financiera ni la historia clínica del animal.',
  };
}

// --- 7. Reporte consolidado -------------------------------------------------

export interface ConsolidatedReportInput {
  organization: CustodyPdfOrganization;
  rows: AnimalReportRow[];
  /** Miniatura por id de animal (solo las que se pudieron leer). */
  photos: Map<string, Buffer>;
  /** Filtros en palabras ("Especie: Perro"), o vacío si es todo el inventario. */
  filterLabels: string[];
  total: number;
  truncated: boolean;
  photosOmitted: boolean;
  now?: Date;
}

export function buildConsolidatedReport(input: ConsolidatedReportInput): CustodyPdfSpec {
  const blocks: CustodyPdfBlock[] = [
    {
      kind: 'fields',
      items: [
        { label: 'Animales incluidos', value: String(input.rows.length) },
        {
          label: 'Filtros aplicados',
          value:
            input.filterLabels.length > 0
              ? input.filterLabels.join(' · ')
              : 'Ninguno (todos los animales)',
        },
      ],
    },
  ];
  if (input.truncated) {
    blocks.push({
      kind: 'notice',
      tone: 'warning',
      text: `El reporte muestra ${input.rows.length} de ${input.total} animales. Aplica filtros para acotarlo o descarga el archivo de Excel, que los incluye todos.`,
    });
  }
  if (input.photosOmitted) {
    blocks.push({
      kind: 'notice',
      text: 'Por el número de animales, este reporte se generó sin fotografías.',
    });
  }
  const withPhotos = !input.photosOmitted;
  const columns = withPhotos
    ? [
        { header: 'Foto', width: 0.06, image: true },
        { header: 'Código', width: 0.08 },
        { header: 'Nombre', width: 0.12 },
        { header: 'Especie y raza', width: 0.13 },
        { header: 'Sexo', width: 0.07 },
        { header: 'Edad', width: 0.1 },
        { header: 'Estado', width: 0.1 },
        { header: 'Ingreso', width: 0.08 },
        { header: 'Responsable', width: 0.12 },
        { header: 'Observaciones', width: 0.14 },
      ]
    : [
        { header: 'Código', width: 0.08 },
        { header: 'Nombre', width: 0.13 },
        { header: 'Especie y raza', width: 0.14 },
        { header: 'Sexo', width: 0.07 },
        { header: 'Edad', width: 0.1 },
        { header: 'Estado', width: 0.11 },
        { header: 'Ingreso', width: 0.08 },
        { header: 'Responsable', width: 0.13 },
        { header: 'Observaciones', width: 0.16 },
      ];
  blocks.push({
    kind: 'table',
    columns,
    rows: input.rows.map((row) => {
      const cells: CustodyPdfCell[] = [
        row.code,
        row.name,
        [SPECIES_LABELS[row.species] ?? row.species, row.breed].filter(Boolean).join(' · '),
        SEX_LABELS[row.sex] ?? row.sex,
        row.ageLabel,
        `${ANIMAL_STATUS_LABELS[row.status] ?? row.status}${row.isActive ? '' : ' (inactivo)'} · ${
          CUSTODY_STATUS_LABELS[row.custodyStatus]
        }`,
        `${formatDateShort(row.intakeDate)}${row.intakeDateSource === 'system_record' ? '*' : ''}`,
        row.responsibleName ?? '',
        (row.notes ?? '').slice(0, 160),
      ];
      return withPhotos ? [input.photos.get(row.id) ?? null, ...cells] : cells;
    }),
    empty: 'Ningún animal coincide con los filtros.',
  });
  blocks.push({
    kind: 'paragraph',
    muted: true,
    size: 8,
    text: '* Fecha de registro en AdoptaFácil: el animal no tiene acta de ingreso.',
  });
  return {
    organization: input.organization,
    title: 'Reporte consolidado de animales',
    subtitle: `${input.rows.length} ${input.rows.length === 1 ? 'animal' : 'animales'}`,
    generatedLabel: generatedLabel(input.now),
    orientation: 'landscape',
    blocks,
    footerNote: 'Reporte administrativo generado a partir de los registros de la organización.',
  };
}

// --- Estado de cuenta -------------------------------------------------------

export interface AccountStatementInput {
  organization: CustodyPdfOrganization;
  responsible: CustodyContractParty;
  charges: CustodyCharge[];
  code: string;
  now?: Date;
}

export function buildAccountStatement(input: AccountStatementInput): CustodyPdfSpec {
  const open = input.charges.filter((charge) => charge.status === 'pending');
  const pending = open.reduce((sum, charge) => sum + charge.balanceCop, 0);
  const overdue = open
    .filter((c) => c.situation === 'overdue' || c.situation === 'extension_breached')
    .reduce((sum, charge) => sum + charge.balanceCop, 0);
  return {
    organization: input.organization,
    title: 'Estado de cuenta',
    subtitle: input.responsible.fullName,
    code: input.code,
    generatedLabel: generatedLabel(input.now),
    footerNote: 'Estado de cuenta administrativo. No es una factura electrónica.',
    blocks: [
      { kind: 'heading', text: 'Responsable' },
      { kind: 'fields', items: partyFields(input.responsible) },
      { kind: 'heading', text: 'Resumen' },
      {
        kind: 'fields',
        items: [
          { label: 'Saldo pendiente', value: formatCop(pending) },
          { label: 'Del cual está vencido', value: formatCop(overdue) },
        ],
      },
      { kind: 'heading', text: 'Cobros pendientes' },
      {
        kind: 'table',
        columns: [
          { header: 'Animal', width: 0.14 },
          { header: 'Concepto', width: 0.3 },
          { header: 'Vence', width: 0.13 },
          { header: 'Situación', width: 0.15 },
          { header: 'Valor', width: 0.14, align: 'right' },
          { header: 'Saldo', width: 0.14, align: 'right' },
        ],
        rows: open.map((charge) => [
          charge.animalName,
          `${CUSTODY_CHARGE_CONCEPT_LABELS[charge.concept]}. ${charge.description}`,
          formatDateShort(charge.effectiveDueDate),
          CUSTODY_CHARGE_SITUATION_LABELS[charge.situation],
          formatCop(charge.amountCop),
          formatCop(charge.balanceCop),
        ]),
        totalRow: ['Total', '', '', '', '', formatCop(pending)],
        empty: 'No hay cobros pendientes.',
      },
      { kind: 'notice', text: CUSTODY_DEBT_SEPARATION_NOTICE },
    ],
  };
}
