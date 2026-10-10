import { MIN_SIGNER_AGE_RANGE } from '@adoptafacil/contracts';

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
