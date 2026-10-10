import { createHash, randomInt } from 'node:crypto';

/** Serialización canónica (claves ordenadas, recursiva): el hash no depende
 *  del orden de propiedades. Mismo criterio que `donation-certificate-hash`. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) sorted[key] = canonicalize(v);
    }
    return sorted;
  }
  return value;
}

export function canonicalString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** SHA-256 hex del contenido canónico: el sello impreso en el documento. */
export function sealHash(value: unknown): string {
  return createHash('sha256').update(canonicalString(value), 'utf8').digest('hex');
}

/** Alfabeto sin caracteres confundibles (sin 0/O, 1/I/L, U). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Folio público `ADF-REP-<año>-<8 caracteres>`: 30^8 ≈ 6,5 × 10^11
 * combinaciones por año, generadas con `crypto.randomInt` — no enumerable
 * (a diferencia de un consecutivo), así la verificación pública no se puede
 * recorrer para descubrir reportes ajenos.
 */
export function generateReportCode(year: number): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += ALPHABET[randomInt(0, ALPHABET.length)];
  return `ADF-REP-${year}-${suffix}`;
}

export const REPORT_CODE_PATTERN = /^ADF-REP-\d{4}-[2-9A-HJKMNP-TV-Z]{8}$/;
