import { describe, expect, it } from 'vitest';
import {
  initials,
  petAgeLabel,
  ratingLabel,
  safeWebsiteHref,
  whatsappHref,
} from './directory-view';

describe('directory-view', () => {
  it('builds a WhatsApp link, adding 57 to a Colombian mobile', () => {
    expect(whatsappHref('300 123 4567')).toBe('https://wa.me/573001234567');
    expect(whatsappHref('+57 300 123 4567')).toBe('https://wa.me/573001234567');
    expect(whatsappHref('12')).toBeUndefined();
    expect(whatsappHref(undefined)).toBeUndefined();
  });

  it('only lets http(s) websites through', () => {
    expect(safeWebsiteHref('https://huellitas.co')).toBe('https://huellitas.co/');
    expect(safeWebsiteHref('javascript:alert(1)')).toBeUndefined();
    expect(safeWebsiteHref('no es url')).toBeUndefined();
  });

  it('describes the rating in plain words', () => {
    expect(ratingLabel(undefined, 0)).toBe('Sin reseñas aún');
    expect(ratingLabel(4.5, 1)).toBe('4,5 ★ · 1 reseña');
    expect(ratingLabel(4, 12)).toBe('4 ★ · 12 reseñas');
  });

  it('computes an approximate pet age', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    expect(petAgeLabel('2026-05-10', now)).toBe('5 meses');
    expect(petAgeLabel('2023-10-16', now)).toBe('3 años');
    expect(petAgeLabel('2027-01-01', now)).toBeUndefined();
  });

  it('takes up to two initials', () => {
    expect(initials('Clínica Huellitas Felices')).toBe('CH');
  });
});
