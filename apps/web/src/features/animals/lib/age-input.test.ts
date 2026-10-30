import { describe, expect, it } from 'vitest';
import { validateAgeInput } from './age-input';

const NOW = new Date('2026-10-24T15:00:00Z');
const exact = (birthDate: string) =>
  validateAgeInput({ mode: 'exact', birthDate, approxYears: '', approxMonths: '' }, NOW);
const approx = (approxYears: string, approxMonths: string) =>
  validateAgeInput({ mode: 'approximate', birthDate: '', approxYears, approxMonths }, NOW);

describe('validateAgeInput', () => {
  it('requires a birth date in exact mode', () => {
    expect(exact('').ok).toBe(false);
  });

  it('rejects a future birth date', () => {
    const result = exact('2026-10-30');
    expect(result).toEqual({
      ok: false,
      message: 'La fecha de nacimiento no puede ser posterior a hoy.',
    });
  });

  it('accepts today and sends the date as UTC midnight', () => {
    expect(exact('2026-10-24')).toEqual({
      ok: true,
      fields: { birthDate: '2026-10-24T00:00:00.000Z' },
    });
  });

  it('requires some approximate age in approximate mode', () => {
    expect(approx('', '').ok).toBe(false);
  });

  it('converts years and months to total months', () => {
    expect(approx('2', '3')).toEqual({ ok: true, fields: { approximateAgeMonths: 27 } });
    expect(approx('', '0')).toEqual({ ok: true, fields: { approximateAgeMonths: 0 } });
  });

  it('rejects non-integer, negative or out-of-range values', () => {
    expect(approx('1.5', '').ok).toBe(false);
    expect(approx('-1', '').ok).toBe(false);
    expect(approx('1', '12').ok).toBe(false);
    expect(approx('101', '').ok).toBe(false);
  });
});
