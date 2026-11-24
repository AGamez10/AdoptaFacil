import { describe, expect, it } from 'vitest';
import {
  PORTAL_TEMPLATE_SEASONS,
  colombiaMonthDay,
  isPremiumTemplate,
  isSeasonalTemplate,
  isTemplateInSeason,
  seasonLabel,
} from '../src/portals';

describe('plantillas de temporada (Navidad, 2026-11-24)', () => {
  it('Navidad es de pago y de temporada; las demás no son de temporada', () => {
    expect(isPremiumTemplate('navidad')).toBe(true);
    expect(isSeasonalTemplate('navidad')).toBe(true);
    expect(isSeasonalTemplate('halo')).toBe(false);
    expect(isTemplateInSeason('halo', new Date('2026-07-01T12:00:00Z'))).toBe(true);
    expect(PORTAL_TEMPLATE_SEASONS.navidad).toEqual({ from: '11-20', to: '01-07' });
  });

  it('usa la fecha de Colombia (UTC-5), no la del servidor', () => {
    // 20 nov a las 02:00 UTC todavía es 19 nov en Bogotá.
    expect(colombiaMonthDay(new Date('2026-11-20T02:00:00Z'))).toBe('11-19');
    expect(isTemplateInSeason('navidad', new Date('2026-11-20T02:00:00Z'))).toBe(false);
    expect(isTemplateInSeason('navidad', new Date('2026-11-20T05:00:00Z'))).toBe(true);
  });

  it('la ventana cruza el año y se repite cada año', () => {
    for (const iso of ['2026-11-24T17:00:00Z', '2026-12-24T23:00:00Z', '2027-01-07T23:00:00Z']) {
      expect(isTemplateInSeason('navidad', new Date(iso))).toBe(true);
    }
    for (const iso of ['2027-01-08T06:00:00Z', '2027-06-15T12:00:00Z', '2027-11-19T12:00:00Z']) {
      expect(isTemplateInSeason('navidad', new Date(iso))).toBe(false);
    }
    expect(isTemplateInSeason('navidad', new Date('2027-11-21T12:00:00Z'))).toBe(true);
  });

  it('explica la ventana en español', () => {
    expect(seasonLabel('navidad')).toBe('del 20 de noviembre al 7 de enero');
    expect(seasonLabel('halo')).toBe('');
  });
});
