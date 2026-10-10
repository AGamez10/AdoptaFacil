import { isValidNit, nitCheckDigit, splitNit } from './nit';

describe('NIT', () => {
  it('calcula el dígito de verificación de NIT conocidos', () => {
    // DIAN: 800.197.268-4.
    expect(nitCheckDigit('800197268')).toBe(4);
    expect(isValidNit('800.197.268', '4')).toBe(true);
    expect(isValidNit('800197268', 5)).toBe(false);
  });

  it('separa base y DV como los escribe una persona', () => {
    expect(splitNit('900.123.456-7')).toEqual([{ base: '900123456', dv: '7' }]);
    expect(splitNit('900123456')).toEqual([{ base: '900123456' }, { base: '90012345', dv: '6' }]);
    expect(splitNit('')).toEqual([]);
  });

  it('rechaza longitudes imposibles', () => {
    expect(isValidNit('123', 0)).toBe(false);
  });
});
