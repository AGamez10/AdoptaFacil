import { UnprocessableEntityException } from '@nestjs/common';
import {
  DEFAULT_FOLLOW_UP_MONTHS,
  MIN_SIGNER_AGE_RANGE,
  describeMissingAdoptionContractFields,
  missingAdoptionContractFields,
  type AdoptionContractData,
  type UpdateAdoptionContractDataInput,
} from '@adoptafacil/contracts';

/**
 * Reglas puras del contrato de adopción (sin framework, testeables directo).
 */

/** Tipo real de una imagen de firma por sus bytes iniciales (no por lo que
 *  declare el cliente). Solo PNG y JPEG: son los que el PDF puede incrustar. */
export function detectSignatureImageType(bytes: Buffer): 'png' | 'jpeg' | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Edad mínima para FIRMAR contratos de adopción de una organización (estudio
 * v4 §B). Mientras no exista la configuración por organización en el panel
 * (requiere migración, ver estudio v4 §F), el piloto la fija por entorno:
 *
 *   ADOPTION_MIN_SIGNER_AGE_BY_ORG="<orgId>:25,<orgId>:21"
 *
 * Valores fuera de 18–30, ids mal formados o entradas ilegibles se ignoran
 * (nunca rompen la generación del contrato); el resto de organizaciones usa 18,
 * el mínimo legal.
 */
export function resolveMinimumSignerAge(
  organizationId: string,
  env: Record<string, string | undefined>,
): number {
  const raw = env.ADOPTION_MIN_SIGNER_AGE_BY_ORG ?? '';
  for (const entry of raw.split(',')) {
    const [id, age] = entry.split(':').map((part) => part?.trim());
    if (!id || !age || !UUID_RE.test(id) || id.toLowerCase() !== organizationId.toLowerCase()) {
      continue;
    }
    const value = Number(age);
    if (
      Number.isInteger(value) &&
      value >= MIN_SIGNER_AGE_RANGE.min &&
      value <= MIN_SIGNER_AGE_RANGE.max
    ) {
      return value;
    }
  }
  return MIN_SIGNER_AGE_RANGE.min;
}

/**
 * Aplica una edición parcial a los datos del contrato: un valor reemplaza al
 * anterior y `null` BORRA el dato (la persona dejó el campo en blanco).
 * `followUpMonths` nunca queda vacío: vuelve al valor por defecto.
 */
export function mergeContractData(
  current: AdoptionContractData,
  input: UpdateAdoptionContractDataInput,
): AdoptionContractData {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  if (typeof next.followUpMonths !== 'number') {
    next.followUpMonths = current.followUpMonths ?? DEFAULT_FOLLOW_UP_MONTHS;
  }
  return next as unknown as AdoptionContractData;
}

/**
 * Un contrato con datos obligatorios en blanco no se firma ni se envía a
 * firmas. El mensaje nombra, en lenguaje llano, exactamente qué falta.
 */
export function assertContractDataComplete(data: AdoptionContractData): void {
  const missing = missingAdoptionContractFields(data);
  if (missing.length > 0) {
    throw new UnprocessableEntityException({
      statusCode: 422,
      error: 'CONTRACT_DATA_INCOMPLETE',
      message: describeMissingAdoptionContractFields(missing),
      missing: missing.map((m) => m.field),
    });
  }
}
