import { describe, expect, it } from 'vitest';
import { isFutureBirthDate, latestAllowedBirthDate } from '../src/animals';

// 2026-10-24 21:00 in Colombia (UTC-5) — already 2026-10-25 in UTC.
const EVENING_BOGOTA = new Date('2026-10-25T02:00:00Z');

describe('animal birth date limits', () => {
  it("uses Colombia's calendar date as today", () => {
    expect(latestAllowedBirthDate(EVENING_BOGOTA)).toBe('2026-10-24');
    expect(latestAllowedBirthDate(new Date('2026-10-25T05:00:00Z'))).toBe('2026-10-25');
  });

  it('accepts today and past dates', () => {
    expect(isFutureBirthDate('2026-10-24T00:00:00.000Z', EVENING_BOGOTA)).toBe(false);
    expect(isFutureBirthDate('2020-01-01T00:00:00.000Z', EVENING_BOGOTA)).toBe(false);
  });

  it('rejects a date later this month (reported case: born on the 30th)', () => {
    expect(isFutureBirthDate('2026-10-30T00:00:00.000Z', EVENING_BOGOTA)).toBe(true);
  });

  it('rejects tomorrow even when it is already tomorrow in UTC', () => {
    expect(isFutureBirthDate('2026-10-25T00:00:00.000Z', EVENING_BOGOTA)).toBe(true);
  });

  it('treats an unparseable date as future (never let it through)', () => {
    expect(isFutureBirthDate('not-a-date', EVENING_BOGOTA)).toBe(true);
  });
});
