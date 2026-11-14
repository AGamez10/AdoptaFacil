import { describe, expect, it } from 'vitest';
import { firstFormProblem } from './form-checks';

describe('firstFormProblem', () => {
  it('devuelve la primera regla que falla, con su propio mensaje', () => {
    expect(
      firstFormProblem([
        { ok: true, title: 'Falta la fecha', message: 'Elige el día.' },
        { ok: false, title: 'Horas no válidas', message: 'Escribe entre 0,5 y 24 horas.' },
        { ok: false, title: 'Falta la descripción', message: 'Cuenta qué hiciste.' },
      ]),
    ).toEqual({ title: 'Horas no válidas', description: 'Escribe entre 0,5 y 24 horas.' });
  });

  it('null cuando todo está bien', () => {
    expect(firstFormProblem([{ ok: true, title: 'x', message: 'y' }])).toBeNull();
  });
});
