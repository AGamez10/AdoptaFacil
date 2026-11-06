import { describe, expect, it } from 'vitest';
import { opportunityHoursDayError, opportunityHoursWindow } from '../src/dates';

const NOW = new Date('2026-11-06T15:00:00.000Z'); // 10:00 en Colombia

describe('ventana de horas de una jornada', () => {
  it('acota a los días de la jornada', () => {
    const w = opportunityHoursWindow('2026-10-20T13:00:00.000Z', '2026-10-25T23:00:00.000Z', NOW);
    expect(w).toEqual({ min: '2026-10-20', max: '2026-10-25', empty: false });
  });

  it('nunca pasa de hoy si la jornada sigue abierta', () => {
    const w = opportunityHoursWindow('2026-11-01T13:00:00.000Z', '2026-12-01T13:00:00.000Z', NOW);
    expect(w.max).toBe('2026-11-06');
  });

  it('rechaza días fuera de la jornada', () => {
    expect(
      opportunityHoursDayError(
        '2026-10-19',
        '2026-10-20T13:00:00.000Z',
        '2026-10-25T13:00:00.000Z',
        NOW,
      ),
    ).toMatch(/Solo puedes registrar horas entre/);
    expect(
      opportunityHoursDayError(
        '2026-10-21',
        '2026-10-20T13:00:00.000Z',
        '2026-10-25T13:00:00.000Z',
        NOW,
      ),
    ).toBeNull();
  });

  it('una jornada que aún no empieza no admite horas', () => {
    const w = opportunityHoursWindow('2026-12-01T13:00:00.000Z', '2026-12-05T13:00:00.000Z', NOW);
    expect(w.empty).toBe(true);
    expect(
      opportunityHoursDayError(
        '2026-11-06',
        '2026-12-01T13:00:00.000Z',
        '2026-12-05T13:00:00.000Z',
        NOW,
      ),
    ).toMatch(/empieza el/);
  });
});
