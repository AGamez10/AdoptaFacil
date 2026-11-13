import { describe, expect, it } from 'vitest';
import { hoursFormProblem } from './volunteering-view';

const base = {
  allowedDays: ['2026-11-08'],
  date: '2026-11-08',
  hoursText: '3',
  description: 'Baños',
};

describe('hoursFormProblem — el aviso dice la causa real', () => {
  it('sin un día de jornada ya ocurrido lo dice, en vez de "datos incompletos"', () => {
    const problem = hoursFormProblem({ ...base, allowedDays: [], date: '' });
    expect(problem?.title).toBe('Aún no puedes registrar horas');
    expect(problem?.description).toContain('ningún día de jornada habilitado');
  });

  it('señala exactamente el campo que falta o está mal', () => {
    expect(hoursFormProblem({ ...base, date: '' })?.title).toBe('Falta el día');
    expect(hoursFormProblem({ ...base, date: '2026-11-09' })?.title).toBe('Día no habilitado');
    expect(hoursFormProblem({ ...base, hoursText: '' })?.title).toBe('Faltan las horas');
    expect(hoursFormProblem({ ...base, hoursText: '30' })?.title).toBe('Horas no válidas');
    expect(hoursFormProblem({ ...base, description: '  ' })?.title).toBe('Falta la descripción');
  });

  it('calendario libre (sin días definidos) y todo bien', () => {
    expect(hoursFormProblem({ ...base, allowedDays: null, date: '2026-11-01' })).toBeNull();
    expect(hoursFormProblem(base)).toBeNull();
  });
});
