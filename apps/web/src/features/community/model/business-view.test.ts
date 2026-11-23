import { describe, expect, it } from 'vitest';
import { dayLabel, impactSentence, monthLabel, typingPassCode } from './business-view';

describe('business-view', () => {
  it('formats a pass code while typing', () => {
    expect(typingPassCode('7k3p')).toBe('7K3P');
    expect(typingPassCode('7k3p9qx')).toBe('7K3P-9QX');
    expect(typingPassCode('7K3P-9QXM-EXTRA')).toBe('7K3P-9QXM');
  });

  it('says the public impact in one sentence, or nothing', () => {
    const zero = {
      contributionsDelivered: 0,
      sheltersSupported: 0,
      adoptersBenefited: 0,
      liveBenefits: 0,
    };
    expect(impactSentence(zero)).toBeNull();
    expect(impactSentence({ ...zero, sheltersSupported: 1 })).toBe('Ha apoyado a 1 refugio.');
    expect(impactSentence({ ...zero, sheltersSupported: 3, adoptersBenefited: 2 })).toBe(
      'Ha apoyado a 3 refugios y 2 familias adoptantes usaron su beneficio.',
    );
  });

  it('labels months and days in Spanish', () => {
    expect(monthLabel('2026-03')).toBe('marzo de 2026');
    expect(dayLabel('2026-12-31')).toBe('31 de diciembre de 2026');
    expect(monthLabel('nope')).toBe('');
  });
});
