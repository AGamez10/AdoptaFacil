import { describe, expect, it } from 'vitest';
import { reportQuery } from '../api/custody-api';
import { formatDate, missingDataOf, parseCopInput } from './custody-view';

describe('custody view model', () => {
  it('lee valores en pesos con o sin puntos y rechaza lo que no es un entero positivo', () => {
    expect(parseCopInput('350.000')).toBe(350000);
    expect(parseCopInput('$ 80000')).toBe(80000);
    expect(parseCopInput('0')).toBeNull();
    expect(parseCopInput('12,5')).toBeNull();
    expect(parseCopInput('abc')).toBeNull();
  });

  it('muestra una fecha de calendario sin moverla de día', () => {
    expect(formatDate('2026-11-05')).toMatch(/5.*nov.*2026/);
  });

  it('saca de un 422 la lista de datos que faltan para generar un documento', () => {
    const error = {
      status: 422,
      details: {
        error: 'missing_required_data',
        missing: [{ field: 'organization.nit', message: 'Registra el NIT.' }, { field: 'x' }],
      },
    };
    expect(missingDataOf(error)).toEqual(['Registra el NIT.']);
    expect(missingDataOf(new Error('otro'))).toEqual([]);
  });

  it('arma la consulta del reporte solo con los filtros puestos', () => {
    expect(reportQuery({})).toBe('');
    expect(reportQuery({ species: 'dog', includeInactive: false, search: '' })).toBe(
      '?species=dog',
    );
    expect(reportQuery({ custody: 'in_custody', includeInactive: true })).toBe(
      '?custody=in_custody&includeInactive=true',
    );
  });
});
