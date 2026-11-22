import { describe, expect, it } from 'vitest';
import { requiredLegalDocuments } from '@adoptafacil/contracts';
import { acceptancesFrom, consentGroupsFor, requiredConsentsGiven } from './consent';

const ids = (audience: Parameters<typeof consentGroupsFor>[0]) =>
  consentGroupsFor(audience).map((g) => g.id);

describe('casillas legales por papel', () => {
  it('solo quien registra o es propietario acepta en nombre de la organización', () => {
    expect(ids('organization')).toContain('organization');
    expect(ids('organization')).not.toContain('member');
  });

  it('un miembro invitado acepta las condiciones de miembro, nunca el contrato de la organización', () => {
    expect(ids('member')).toContain('member');
    expect(ids('member')).not.toContain('organization');
  });

  it('una persona y un donante sin cuenta no ven casillas de organización ni de miembro', () => {
    for (const audience of ['person', 'guest'] as const) {
      expect(ids(audience)).not.toContain('organization');
      expect(ids(audience)).not.toContain('member');
    }
  });

  it('lo que envía un miembro con todo marcado es exactamente lo obligatorio de su papel', () => {
    const all = { terms: true, data: true, member: true };
    expect(requiredConsentsGiven('member', all)).toBe(true);
    expect(requiredConsentsGiven('member', { terms: true, data: true })).toBe(false);
    const sent = acceptancesFrom('member', all).map((a) => a.key);
    expect([...sent].sort()).toEqual([...requiredLegalDocuments('member')].sort());
  });
});
