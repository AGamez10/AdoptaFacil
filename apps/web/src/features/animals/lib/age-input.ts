import { DATE_RULES, dateRuleError } from '@adoptafacil/contracts';

/** How the operator states the age: the exact birth date, or an approximate
 *  age for rescues whose birth date nobody knows. */
export type AgeMode = 'exact' | 'approximate';

export interface AgeFormValue {
  mode: AgeMode;
  /** `YYYY-MM-DD` from the date input; '' when empty. */
  birthDate: string;
  /** Raw text of the "años" / "meses" inputs; '' when empty. */
  approxYears: string;
  approxMonths: string;
}

export type AgeFields =
  | { birthDate: string; approximateAgeMonths?: undefined }
  | { birthDate?: undefined; approximateAgeMonths: number };

export type AgeValidation = { ok: true; fields: AgeFields } | { ok: false; message: string };

/** Same cap as the API (`approximateAgeMonths` max 1200). */
const MAX_APPROX_MONTHS = 1200;

function parseWhole(raw: string): number | null {
  const text = raw.trim();
  if (!text) return 0;
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

/**
 * Validates the age block of the animal form with the SAME rule the API
 * enforces: the age is required (exact date or approximate age) and a birth
 * date can never be in the future. Returns the request fields on success.
 */
export function validateAgeInput(value: AgeFormValue, now: Date = new Date()): AgeValidation {
  if (value.mode === 'exact') {
    if (!value.birthDate) {
      return {
        ok: false,
        message: 'Indica la fecha de nacimiento o marca que no conoces la fecha exacta.',
      };
    }
    const error = dateRuleError(value.birthDate, DATE_RULES.animalBirth, now);
    if (error) return { ok: false, message: error };
    return { ok: true, fields: { birthDate: `${value.birthDate}T00:00:00.000Z` } };
  }

  if (!value.approxYears.trim() && !value.approxMonths.trim()) {
    return { ok: false, message: 'Indica la edad aproximada en años y/o meses.' };
  }
  const years = parseWhole(value.approxYears);
  const months = parseWhole(value.approxMonths);
  if (years === null || months === null || months > 11) {
    return {
      ok: false,
      message: 'La edad aproximada debe ser en números enteros (meses de 0 a 11).',
    };
  }
  const total = years * 12 + months;
  if (total > MAX_APPROX_MONTHS) {
    return { ok: false, message: 'La edad aproximada no puede superar los 100 años.' };
  }
  return { ok: true, fields: { approximateAgeMonths: total } };
}
