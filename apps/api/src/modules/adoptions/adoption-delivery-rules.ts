import { createHash, randomInt } from 'node:crypto';
import {
  DEFAULT_FOLLOW_UP_MONTHS,
  DEFAULT_FOLLOW_UP_PLAN,
  type AdoptionAnimalRecord,
  type AdoptionContractData,
  type AdoptionDeliveryDetails,
  type AdoptionDeliveryMilestonePlanItem,
  type AdoptionRecordBehavior,
  type AdoptionRecordClinicalEntry,
} from '@adoptafacil/contracts';
import { canonicalJson } from './adoption-contract-hash';

/**
 * Reglas PURAS del acta de entrega (ajuste 6), sin NestJS ni Prisma, para
 * testearlas directo. El service arma los datos y llama aquí.
 */

/** Código de 6 dígitos (con ceros a la izquierda) para confirmar la entrega. */
export function generateDeliveryCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Hash del código ligado al acta: un mismo código no sirve para otra entrega. */
export function hashDeliveryCode(deliveryId: string, code: string): string {
  return createHash('sha256').update(`${deliveryId}:${code}`, 'utf8').digest('hex');
}

/** Enlace que codifica el QR: la página de confirmación del adoptante. */
export function deliveryConfirmUrl(webBaseUrl: string, deliveryId: string, code: string): string {
  const base = webBaseUrl.replace(/\/+$/, '');
  return `${base}/mis-adopciones/entrega/${deliveryId}?codigo=${code}`;
}

/**
 * Hitos que se programan al confirmar, según el plan elegido en el contrato
 * (estudio v4 §C): `light` = 1, 4 y 12 meses; `standard` agrega los 15 días.
 * Se omiten los que caen después del plazo pactado de seguimiento, y si el
 * animal se entregó sin esterilizar con plazo fijado, ese plazo tiene su hito.
 */
export function buildMilestonePlan(
  data: Partial<AdoptionContractData>,
): AdoptionDeliveryMilestonePlanItem[] {
  const plan = data.followUpPlan ?? DEFAULT_FOLLOW_UP_PLAN;
  const months = data.followUpMonths ?? DEFAULT_FOLLOW_UP_MONTHS;
  const items: AdoptionDeliveryMilestonePlanItem[] = [];
  if (plan === 'standard') {
    items.push({ title: 'Seguimiento de los 15 días', offset: '15 days' });
  }
  for (const m of [1, 4, 12]) {
    if (m <= months) {
      items.push({
        title: m === 1 ? 'Seguimiento del primer mes' : `Seguimiento de los ${m} meses`,
        offset: m === 1 ? '1 month' : `${m} months`,
      });
    }
  }
  const sterilizeIn = data.sterilizationCommitmentMonths;
  if (data.animalSterilized === false && sterilizeIn && sterilizeIn > 0) {
    items.push({
      title: 'Soporte de esterilización',
      offset: sterilizeIn === 1 ? '1 month' : `${sterilizeIn} months`,
    });
  }
  return items;
}

/** Fila mínima de un evento clínico (una versión). */
export interface ClinicalEventRow {
  eventId: string;
  version: number;
  type: string;
  occurredAt: Date;
  nextDueDate: Date | null;
}

/** Fila mínima de una declaración de comportamiento. */
export interface BehaviorRow {
  reactivityNotes: string | null;
  biteHistory: boolean;
  biteHistoryDetail: string | null;
  childrenCompatibility: string;
  medicalConditionsRelevant: string | null;
  declaredAt: Date;
}

export interface AnimalRecordInput {
  organizationName: string;
  animal: {
    id: string;
    name: string;
    species: string;
    sex: string;
    breed: string | null;
    birthDate: Date | null;
    approximateAgeMonths: number | null;
  };
  contractData: Partial<AdoptionContractData>;
  clinicalEvents: ClinicalEventRow[];
  behaviorDisclosures: BehaviorRow[];
}

/** Versión vigente (la de mayor `version`) de cada evento clínico, por fecha. */
function currentClinical(rows: ClinicalEventRow[]): AdoptionRecordClinicalEntry[] {
  const latest = new Map<string, ClinicalEventRow>();
  for (const row of rows) {
    const seen = latest.get(row.eventId);
    if (!seen || row.version > seen.version) latest.set(row.eventId, row);
  }
  return [...latest.values()]
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .map((row) => ({
      type: row.type,
      occurredAt: row.occurredAt.toISOString(),
      ...(row.nextDueDate ? { nextDueDate: row.nextDueDate.toISOString() } : {}),
    }));
}

function latestBehavior(rows: BehaviorRow[]): AdoptionRecordBehavior | undefined {
  const last = [...rows].sort((a, b) => b.declaredAt.getTime() - a.declaredAt.getTime())[0];
  if (!last) return undefined;
  return {
    biteHistory: last.biteHistory,
    childrenCompatibility: last.childrenCompatibility,
    declaredAt: last.declaredAt.toISOString(),
    ...(last.reactivityNotes ? { reactivityNotes: last.reactivityNotes } : {}),
    ...(last.biteHistoryDetail ? { biteHistoryDetail: last.biteHistoryDetail } : {}),
    ...(last.medicalConditionsRelevant
      ? { medicalConditionsRelevant: last.medicalConditionsRelevant }
      : {}),
  };
}

/**
 * Ficha del animal para el adoptante. Solo lo que importa para el cuidado:
 * identificación, eventos clínicos (tipo y fechas) y comportamiento. Nunca
 * notas internas, costos, adjuntos ni datos del equipo de la organización.
 */
export function buildAnimalRecord(input: AnimalRecordInput): AdoptionAnimalRecord {
  const { animal, contractData: data } = input;
  const clinical = currentClinical(input.clinicalEvents);
  const behavior = latestBehavior(input.behaviorDisclosures);
  const sterilized =
    data.animalSterilized ?? (clinical.some((c) => c.type === 'sterilization') || undefined);
  return {
    organizationName: input.organizationName,
    animal: {
      id: animal.id,
      name: animal.name,
      species: animal.species,
      sex: animal.sex,
      ...(animal.breed ? { breed: animal.breed } : {}),
      ...(animal.birthDate ? { birthDate: animal.birthDate.toISOString() } : {}),
      ...(animal.approximateAgeMonths !== null
        ? { approximateAgeMonths: animal.approximateAgeMonths }
        : {}),
    },
    ...(data.animalIdentificationType
      ? {
          identification: {
            type: data.animalIdentificationType,
            ...(data.animalIdentificationNumber ? { number: data.animalIdentificationNumber } : {}),
          },
        }
      : {}),
    ...(sterilized !== undefined ? { sterilized } : {}),
    ...(sterilized === false && data.sterilizationCommitmentMonths
      ? { sterilizationCommitmentMonths: data.sterilizationCommitmentMonths }
      : {}),
    clinical,
    ...(behavior ? { behavior } : {}),
  };
}

/** Sello SHA-256 del acta: detalles + ficha + plan, en forma canónica. */
export function computeDeliveryHash(input: {
  contractId: string;
  details: AdoptionDeliveryDetails;
  record: AdoptionAnimalRecord;
  milestonePlan: AdoptionDeliveryMilestonePlanItem[];
}): string {
  return createHash('sha256').update(canonicalJson(input), 'utf8').digest('hex');
}
