import { describe, expect, it } from 'vitest';
import {
  DATE_RULES,
  dateInputBounds,
  dateOrderError,
  dateRuleError,
  isCalendarDate,
  parseCalendarDay,
  todayInColombia,
} from '../src/dates';

/** 30-oct-2026 a las 21:00 en Bogotá = 31-oct 02:00 UTC: "hoy" sigue siendo 30. */
const EVENING_BOGOTA = new Date('2026-10-31T02:00:00Z');

describe('criterio compartido de fechas', () => {
  it('hoy es el día de Colombia, no el de UTC', () => {
    expect(todayInColombia(EVENING_BOGOTA)).toBe('2026-10-30');
  });

  it('rechaza fechas que no existen en el calendario', () => {
    for (const value of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-04-31', '2026-00-10']) {
      expect(isCalendarDate(value)).toBe(false);
      expect(dateRuleError(value, DATE_RULES.animalBirth, EVENING_BOGOTA)).toBe(
        'La fecha de nacimiento no existe en el calendario. Revisa el día y el mes.',
      );
    }
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(parseCalendarDay('2026-02-30T00:00:00.000Z')).toEqual({
      ok: false,
      reason: 'nonexistent',
    });
    expect(parseCalendarDay('2026-10-30T25:00:00Z')).toEqual({ ok: false, reason: 'nonexistent' });
  });

  it('rechaza formatos ambiguos o sin zona horaria', () => {
    for (const value of [
      '30/10/2026',
      '10/30/2026',
      '2026-1-5',
      '30-10-2026',
      'ayer',
      '',
      '2026-10-30T10:00:00',
    ]) {
      expect(dateRuleError(value, DATE_RULES.campaignSpent, EVENING_BOGOTA)).toBe(
        'La fecha del gasto no es una fecha válida. Usa el formato AAAA-MM-DD.',
      );
    }
  });

  it('un día enviado como medianoche UTC es ese día; otro instante se lee en hora de Colombia', () => {
    expect(parseCalendarDay('2026-10-31T00:00:00.000Z')).toEqual({ ok: true, day: '2026-10-31' });
    expect(parseCalendarDay('2026-10-31T03:00:00Z')).toEqual({ ok: true, day: '2026-10-30' });
    expect(parseCalendarDay('2026-10-30T22:00:00-05:00')).toEqual({ ok: true, day: '2026-10-30' });
  });

  it('nacimiento, expedición, gasto o sesión: nunca después de hoy', () => {
    expect(dateRuleError('2026-10-30', DATE_RULES.animalBirth, EVENING_BOGOTA)).toBeNull();
    expect(dateRuleError('2026-10-31T00:00:00.000Z', DATE_RULES.animalBirth, EVENING_BOGOTA)).toBe(
      'La fecha de nacimiento no puede ser posterior a hoy.',
    );
    expect(dateRuleError('2026-11-01', DATE_RULES.documentIssued, EVENING_BOGOTA)).toBe(
      'La fecha de expedición no puede ser posterior a hoy.',
    );
    expect(dateRuleError('2026-10-31', DATE_RULES.serviceHoursDate, EVENING_BOGOTA)).toBe(
      'La fecha de la sesión no puede ser posterior a hoy.',
    );
  });

  it('vencimientos y plazos: nunca antes de hoy, ni absurdamente lejos', () => {
    expect(dateRuleError('2026-10-29', DATE_RULES.documentExpires, EVENING_BOGOTA)).toBe(
      'La fecha de vencimiento no puede ser anterior a hoy.',
    );
    expect(dateRuleError('2026-10-30', DATE_RULES.documentExpires, EVENING_BOGOTA)).toBeNull();
    expect(dateRuleError('2026-10-01', DATE_RULES.campaignDeadline, EVENING_BOGOTA)).toBe(
      'La fecha límite de la campaña no puede ser anterior a hoy.',
    );
    expect(dateRuleError('2035-01-01', DATE_RULES.campaignDeadline, EVENING_BOGOTA)).toBe(
      'La fecha límite de la campaña no puede estar a más de 3 años en el futuro.',
    );
  });

  it('años absurdos hacia atrás', () => {
    expect(dateRuleError('1890-05-01', DATE_RULES.documentIssued, EVENING_BOGOTA)).toBe(
      'La fecha de expedición no puede ser anterior al 1 de enero de 1900.',
    );
    expect(dateRuleError('1975-05-01', DATE_RULES.animalBirth, EVENING_BOGOTA)).toBe(
      'La fecha de nacimiento no puede ser anterior al 1 de enero de 1980.',
    );
  });

  it('orden entre dos fechas', () => {
    const labels = { start: 'La fecha de expedición', end: 'La fecha de vencimiento' };
    expect(dateOrderError('2026-05-01', '2026-04-01', labels)).toBe(
      'La fecha de vencimiento no puede ser anterior a la fecha de expedición.',
    );
    expect(dateOrderError('2026-05-01', '2026-05-01', labels, { strict: true })).toBe(
      'La fecha de vencimiento debe ser posterior a la fecha de expedición.',
    );
    expect(dateOrderError('2026-05-01', '2026-05-02', labels, { strict: true })).toBeNull();
  });

  it('el calendario de la web usa los mismos límites', () => {
    expect(dateInputBounds(DATE_RULES.animalBirth, EVENING_BOGOTA)).toEqual({
      min: '1980-01-01',
      max: '2026-10-30',
    });
    expect(dateInputBounds(DATE_RULES.documentExpires, EVENING_BOGOTA)).toEqual({
      min: '2026-10-30',
      max: '2076-10-30',
    });
  });
});
