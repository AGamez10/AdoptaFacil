import { z } from 'zod';
import {
  ANIMAL_SEXES,
  ANIMAL_SPECIES,
  ANIMAL_STATUSES,
  CUSTODY_CHARGE_CONCEPTS,
  CUSTODY_CLAUSE_BODY_MAX,
  CUSTODY_CLAUSE_TITLE_MAX,
  CUSTODY_ID_TYPES,
  CUSTODY_INTAKE_REASONS,
  CUSTODY_LONG_TEXT_MAX,
  CUSTODY_MAX_AMOUNT_COP,
  CUSTODY_MAX_CLAUSES,
  CUSTODY_NAME_MAX,
  CUSTODY_PAYMENT_FREQUENCIES,
  CUSTODY_PAYMENT_METHODS,
  CUSTODY_PREVENTIVE_STATUSES,
  CUSTODY_REASON_MIN,
  CUSTODY_RELEASE_TYPES,
  CUSTODY_SHORT_TEXT_MAX,
  CUSTODY_UPLOADABLE_DOCUMENT_KINDS,
  unknownCustodyVariables,
} from '@adoptafacil/contracts';
import { isRealDate, todayInColombia } from './custody.util';

/**
 * Validación de la API de custodia. Los mensajes van en español porque llegan
 * tal cual al formulario. Varios cuerpos llegan como multipart (con un
 * archivo), donde todo es texto: por eso los números y los booleanos se
 * coaccionan y un campo vacío cuenta como ausente.
 */

const EARLIEST = '2000-01-01';

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const text = (max: number, label: string) =>
  z
    .string({ message: `${label}: escribe un texto.` })
    .trim()
    .max(max, `${label}: admite hasta ${max} caracteres.`);

const optionalText = (max: number, label: string) =>
  z.preprocess(emptyToUndefined, text(max, label).optional());

const requiredText = (min: number, max: number, label: string) =>
  text(max, label).min(min, `${label}: escribe al menos ${min} caracteres.`);

const dateOnly = (label: string) =>
  z
    .string({ message: `${label}: indica la fecha.` })
    .refine(isRealDate, `${label}: la fecha no es válida.`)
    .refine((v) => v >= EARLIEST, `${label}: la fecha es demasiado antigua.`);

const pastOrToday = (label: string) =>
  dateOnly(label).refine((v) => v <= todayInColombia(), `${label}: no puede ser una fecha futura.`);

const optionalDate = (label: string) => z.preprocess(emptyToUndefined, dateOnly(label).optional());

/** Instante ISO que no puede estar en el futuro (con un margen de reloj). */
const pastInstant = (label: string) =>
  z
    .string({ message: `${label}: indica la fecha y la hora.` })
    .refine((v) => !Number.isNaN(Date.parse(v)), `${label}: la fecha no es válida.`)
    .refine((v) => Date.parse(v) <= Date.now() + 5 * 60_000, `${label}: no puede ser futura.`)
    .refine((v) => Date.parse(v) >= Date.parse(EARLIEST), `${label}: es demasiado antigua.`);

const amount = (label: string) =>
  z.coerce
    .number({ message: `${label}: escribe el valor en pesos.` })
    .int(`${label}: escribe el valor en pesos, sin centavos.`)
    .positive(`${label}: debe ser mayor que cero.`)
    .max(CUSTODY_MAX_AMOUNT_COP, `${label}: el valor es demasiado alto. Revisa los ceros.`);

const bool = z.preprocess((value) => {
  if (value === 'true' || value === '1' || value === 'on') return true;
  if (value === 'false' || value === '0' || value === '' || value === undefined) return false;
  return value;
}, z.boolean());

const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());

/** Un registro retrospectivo siempre dice de dónde sale la información. */
function requireSource(
  value: { isRetrospective?: boolean; retrospectiveSource?: string },
  ctx: z.RefinementCtx,
): void {
  if (
    value.isRetrospective &&
    (value.retrospectiveSource ?? '').trim().length < CUSTODY_REASON_MIN
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['retrospectiveSource'],
      message:
        'Indica de dónde sale la información de este registro retrospectivo (por ejemplo, "contrato en papel del 3 de marzo").',
    });
  }
}

// --- Responsables -----------------------------------------------------------

export const responsibleSchema = z
  .object({
    fullName: requiredText(2, CUSTODY_NAME_MAX, 'Nombre completo'),
    documentType: z.enum(CUSTODY_ID_TYPES, { message: 'Elige el tipo de documento.' }),
    documentNumber: z
      .string({ message: 'Escribe el número de documento.' })
      .trim()
      .regex(/^[0-9A-Za-z.\- ]{3,30}$/, 'El número de documento no es válido.'),
    phone: optionalText(40, 'Teléfono'),
    email: z.preprocess(
      emptyToUndefined,
      z.string().trim().email('El correo no es válido.').max(200).optional(),
    ),
    address: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Dirección'),
    city: optionalText(120, 'Ciudad'),
    notes: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Notas'),
  })
  .strict();

// --- Ingreso ---------------------------------------------------------------

export const intakeSchema = z
  .object({
    intakeAt: pastInstant('Fecha y hora de ingreso'),
    reason: z.enum(CUSTODY_INTAKE_REASONS, { message: 'Elige el motivo del ingreso.' }),
    reasonDetail: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Detalle del motivo'),
    origin: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Procedencia'),
    responsibleId: optionalUuid,
    physicalCondition: requiredText(3, CUSTODY_LONG_TEXT_MAX, 'Condición física observable'),
    particularFeatures: optionalText(CUSTODY_LONG_TEXT_MAX, 'Características particulares'),
    vaccinationStatus: z.enum(CUSTODY_PREVENTIVE_STATUSES).default('unknown'),
    dewormingStatus: z.enum(CUSTODY_PREVENTIVE_STATUSES).default('unknown'),
    preventiveNotes: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Notas de vacunación'),
    foodProvided: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Alimentación suministrada'),
    medicationsReported: optionalText(CUSTODY_LONG_TEXT_MAX, 'Medicamentos informados'),
    notes: optionalText(CUSTODY_LONG_TEXT_MAX, 'Observaciones'),
    receivedByName: requiredText(2, CUSTODY_NAME_MAX, 'Persona que recibe'),
    hasVetAssessment: bool.default(false),
    vetName: optionalText(CUSTODY_NAME_MAX, 'Nombre del profesional'),
    vetLicense: optionalText(60, 'Tarjeta profesional'),
    vetAssessmentDate: optionalDate('Fecha de la valoración'),
    isRetrospective: bool.default(false),
    retrospectiveSource: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Procedencia de la información'),
  })
  .strict()
  .superRefine(requireSource);

export type IntakeDto = z.infer<typeof intakeSchema>;

// --- Plantillas y contratos -------------------------------------------------

const clauseSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,60}$/, 'El identificador de la cláusula no es válido.'),
    title: requiredText(2, CUSTODY_CLAUSE_TITLE_MAX, 'Título de la cláusula'),
    body: requiredText(10, CUSTODY_CLAUSE_BODY_MAX, 'Texto de la cláusula'),
    enabled: z.boolean(),
    locked: z.boolean().optional(),
  })
  .strict()
  .superRefine((clause, ctx) => {
    const unknown = unknownCustodyVariables(clause.body);
    if (unknown.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: `La cláusula "${clause.title}" usa variables que no existen: ${unknown
          .map((v) => `{{${v}}}`)
          .join(', ')}.`,
      });
    }
  });

const clausesSchema = z
  .array(clauseSchema)
  .min(1, 'La plantilla necesita al menos una cláusula.')
  .max(CUSTODY_MAX_CLAUSES, `Una plantilla admite hasta ${CUSTODY_MAX_CLAUSES} cláusulas.`)
  .refine(
    (clauses) => new Set(clauses.map((c) => c.id)).size === clauses.length,
    'Hay cláusulas repetidas.',
  );

const annexesSchema = z
  .array(requiredText(3, CUSTODY_SHORT_TEXT_MAX, 'Anexo'))
  .max(20, 'Un contrato admite hasta 20 anexos.');

export const contractTemplateSchema = z
  .object({
    name: requiredText(2, CUSTODY_NAME_MAX, 'Nombre de la plantilla'),
    clauses: clausesSchema,
    annexes: annexesSchema.default([]),
  })
  .strict();

const representativeSchema = z
  .object({
    fullName: requiredText(2, CUSTODY_NAME_MAX, 'Nombre de quien firma por la organización'),
    documentType: z.enum(CUSTODY_ID_TYPES, { message: 'Elige el tipo de documento.' }),
    documentNumber: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z.\- ]{3,30}$/, 'El documento de quien firma no es válido.'),
    position: requiredText(2, 120, 'Cargo de quien firma'),
  })
  .strict();

export const contractSchema = z
  .object({
    animalId: z.string().uuid(),
    responsibleId: z.string().uuid({ message: 'Elige al responsable del animal.' }),
    representative: representativeSchema,
    templateKey: z.preprocess(emptyToUndefined, z.string().max(60).optional()),
    startDate: dateOnly('Fecha de inicio'),
    endDate: optionalDate('Fecha de finalización'),
    monthlyFeeCop: z.coerce
      .number({ message: 'Escribe el valor del servicio.' })
      .int()
      .min(0, 'El valor no puede ser negativo.')
      .max(CUSTODY_MAX_AMOUNT_COP, 'El valor es demasiado alto. Revisa los ceros.'),
    foodFeeCop: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(0).max(CUSTODY_MAX_AMOUNT_COP).optional(),
    ),
    paymentFrequency: z.enum(CUSTODY_PAYMENT_FREQUENCIES).default('monthly'),
    paymentDay: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number()
        .int()
        .min(1, 'El día de pago va de 1 a 28.')
        .max(28, 'El día de pago va de 1 a 28.')
        .optional(),
    ),
    graceDays: z.coerce.number().int().min(0).max(60).default(0),
    pickupDays: z.coerce.number().int().min(1).max(90).default(10),
    noticeDays: z.coerce.number().int().min(0).max(90).default(8),
    serviceCity: optionalText(120, 'Ciudad del servicio'),
    paymentConditions: optionalText(CUSTODY_LONG_TEXT_MAX, 'Condiciones de pago'),
    observations: optionalText(CUSTODY_LONG_TEXT_MAX, 'Observaciones'),
    clauses: clausesSchema.optional(),
    annexes: annexesSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'La fecha de finalización no puede ser anterior a la de inicio.',
      });
    }
  });

export type ContractDto = z.infer<typeof contractSchema>;

export const issueContractSchema = z
  .object({
    /** Confirmación explícita: emitir congela los términos. */
    confirm: z.literal(true, { message: 'Confirma que quieres emitir el contrato definitivo.' }),
  })
  .strict();

export const endContractSchema = z
  .object({
    reason: requiredText(CUSTODY_REASON_MIN, CUSTODY_SHORT_TEXT_MAX, 'Motivo'),
  })
  .strict();

// --- Cuenta -----------------------------------------------------------------

export const chargeSchema = z
  .object({
    animalId: z.string().uuid(),
    responsibleId: z.string().uuid({ message: 'Elige al responsable del pago.' }),
    contractId: optionalUuid,
    concept: z.enum(CUSTODY_CHARGE_CONCEPTS, { message: 'Elige el concepto.' }),
    description: requiredText(3, CUSTODY_SHORT_TEXT_MAX, 'Descripción'),
    amountCop: amount('Valor'),
    dueDate: dateOnly('Fecha de vencimiento'),
    expenseDate: z.preprocess(emptyToUndefined, pastOrToday('Fecha del gasto').optional()),
    periodLabel: optionalText(60, 'Periodo'),
  })
  .strict();

export type ChargeDto = z.infer<typeof chargeSchema>;

export const paymentSchema = z
  .object({
    amountCop: amount('Valor recibido'),
    paidOn: pastOrToday('Fecha del pago'),
    method: z.enum(CUSTODY_PAYMENT_METHODS, { message: 'Elige el medio de pago.' }),
    reference: optionalText(120, 'Referencia'),
    notes: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Notas'),
  })
  .strict();

export type PaymentDto = z.infer<typeof paymentSchema>;

export const extensionSchema = z
  .object({
    newDueDate: dateOnly('Nueva fecha de compromiso'),
    reason: requiredText(CUSTODY_REASON_MIN, CUSTODY_SHORT_TEXT_MAX, 'Motivo de la prórroga'),
    requestedBy: optionalText(CUSTODY_NAME_MAX, 'Quién la solicita'),
  })
  .strict();

export const reasonSchema = z
  .object({
    reason: requiredText(CUSTODY_REASON_MIN, CUSTODY_SHORT_TEXT_MAX, 'Motivo'),
  })
  .strict();

export const collectionSchema = z
  .object({
    note: requiredText(CUSTODY_REASON_MIN, CUSTODY_LONG_TEXT_MAX, 'Qué se decidió'),
    /** Una persona confirma que revisó el caso: nunca lo inicia un proceso. */
    humanReviewConfirmed: z.literal(true, {
      message: 'Confirma que revisaste el caso antes de iniciar el procedimiento.',
    }),
  })
  .strict();

// --- Salida -----------------------------------------------------------------

export const releaseSchema = z
  .object({
    releaseType: z.enum(CUSTODY_RELEASE_TYPES, { message: 'Elige el tipo de salida.' }),
    releasedAt: pastInstant('Fecha y hora de salida'),
    receivedByName: requiredText(2, CUSTODY_NAME_MAX, 'Quién recibe al animal'),
    receivedByDocument: optionalText(40, 'Documento de quien recibe'),
    receivedByPhone: optionalText(40, 'Teléfono de quien recibe'),
    receivedByRelation: optionalText(120, 'Relación con el animal'),
    conditionAtRelease: requiredText(3, CUSTODY_LONG_TEXT_MAX, 'Condición observable al salir'),
    notes: optionalText(CUSTODY_LONG_TEXT_MAX, 'Observaciones'),
    deliveredByName: requiredText(2, CUSTODY_NAME_MAX, 'Quién entrega por la organización'),
    authorityName: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Autoridad que recibe'),
    authorityBasis: optionalText(CUSTODY_LONG_TEXT_MAX, 'Fundamento de la decisión'),
    humanReviewConfirmed: bool.default(false),
    isRetrospective: bool.default(false),
    retrospectiveSource: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Procedencia de la información'),
  })
  .strict()
  .superRefine((value, ctx) => {
    requireSource(value, ctx);
    if (value.releaseType !== 'handover_to_authority') return;
    if ((value.authorityName ?? '').trim().length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['authorityName'],
        message: 'Indica a qué autoridad competente se entrega el animal.',
      });
    }
    if ((value.authorityBasis ?? '').trim().length < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['authorityBasis'],
        message: 'Explica el fundamento y el procedimiento que se siguió.',
      });
    }
    if (!value.humanReviewConfirmed) {
      ctx.addIssue({
        code: 'custom',
        path: ['humanReviewConfirmed'],
        message:
          'Entregar un animal a una autoridad exige que una persona de la organización revise el caso y lo decida. Confírmalo para continuar.',
      });
    }
  });

export type ReleaseDto = z.infer<typeof releaseSchema>;

// --- Documentos y novedades -------------------------------------------------

export const uploadDocumentSchema = z
  .object({
    kind: z.enum(CUSTODY_UPLOADABLE_DOCUMENT_KINDS as [string, ...string[]], {
      message: 'Elige el tipo de documento.',
    }),
    title: requiredText(2, 200, 'Título'),
    documentDate: z.preprocess(emptyToUndefined, pastOrToday('Fecha del documento').optional()),
    intakeId: optionalUuid,
    contractId: optionalUuid,
    chargeId: optionalUuid,
    paymentId: optionalUuid,
    releaseId: optionalUuid,
    isRetrospective: bool.default(false),
    retrospectiveSource: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Procedencia de la información'),
  })
  .strict()
  .superRefine(requireSource);

export type UploadDocumentDto = z.infer<typeof uploadDocumentSchema>;

export const eventSchema = z
  .object({
    type: z.enum(['incident', 'note'], { message: 'Elige si es una novedad o una nota.' }),
    summary: requiredText(3, CUSTODY_SHORT_TEXT_MAX, 'Resumen'),
    detail: optionalText(CUSTODY_LONG_TEXT_MAX, 'Detalle'),
    occurredAt: pastInstant('Cuándo ocurrió'),
    responsibleNotified: bool.optional(),
    isRetrospective: bool.default(false),
    retrospectiveSource: optionalText(CUSTODY_SHORT_TEXT_MAX, 'Procedencia de la información'),
  })
  .strict()
  .superRefine(requireSource);

export type EventDto = z.infer<typeof eventSchema>;

// --- Reportes ---------------------------------------------------------------

export const reportFiltersSchema = z
  .object({
    status: z.preprocess(
      emptyToUndefined,
      z.enum(ANIMAL_STATUSES as [string, ...string[]]).optional(),
    ),
    species: z.preprocess(
      emptyToUndefined,
      z.enum(ANIMAL_SPECIES as [string, ...string[]]).optional(),
    ),
    sex: z.preprocess(emptyToUndefined, z.enum(ANIMAL_SEXES as [string, ...string[]]).optional()),
    custody: z.preprocess(
      emptyToUndefined,
      z.enum(['not_registered', 'in_custody', 'released']).optional(),
    ),
    intakeFrom: optionalDate('Ingreso desde'),
    intakeTo: optionalDate('Ingreso hasta'),
    includeInactive: bool.default(false),
    search: optionalText(80, 'Búsqueda'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.intakeFrom && value.intakeTo && value.intakeTo < value.intakeFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['intakeTo'],
        message: 'El rango de fechas de ingreso está al revés.',
      });
    }
  });

export type ReportFiltersDto = z.infer<typeof reportFiltersSchema>;
