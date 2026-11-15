import { describe, expect, it } from 'vitest';
import type { AdoptionContract } from '@adoptafacil/contracts';
import { contractNextSteps, followUpContactsText } from './adoptions-next-steps';

function contract(over: Partial<AdoptionContract>, data: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    status: 'draft',
    signers: [
      { id: 's1', role: 'organization_representative', fullName: 'Rep', userId: 'u-rep' },
      { id: 's2', role: 'adopter', fullName: 'Juan', userId: 'u-adopter' },
    ],
    payload: { animal: { name: 'Chorizo' }, data: { followUpMonths: 12, ...data } },
    ...over,
  } as unknown as AdoptionContract;
}

const opts = { dataComplete: true, viewerHasSigned: false };

describe('followUpContactsText (punto 12)', () => {
  it('el plan acompañado solo agrega el contacto de los 15 días', () => {
    expect(followUpContactsText('light', 12)).toBe('al mes, a los 4 meses y a los 12 meses');
    expect(followUpContactsText('standard', 12)).toBe(
      'a los 15 días, al mes, a los 4 meses y a los 12 meses',
    );
  });

  it('no promete contactos después del plazo pactado', () => {
    expect(followUpContactsText('light', 6)).toBe('al mes y a los 4 meses');
  });
});

describe('contractNextSteps (punto 14)', () => {
  it('borrador: guía a la organización y marca lo que ya hizo', () => {
    const steps = contractNextSteps(contract({}), 'organization', {
      dataComplete: false,
      viewerHasSigned: false,
    });
    expect(steps?.steps.map((s) => s.done)).toEqual([false, false, false]);
    expect(steps?.steps[0].text).toContain('Completa y guarda');
  });

  it('enviado a firmas: al adoptante le dice que le falta firmar', () => {
    const steps = contractNextSteps(contract({ status: 'pending_signatures' }), 'adopter', opts);
    expect(steps?.title).toBe('Te falta un paso: firmar el contrato');
  });

  it('firmado: cada parte ve sus propios pasos, con el animal y las fechas del plan', () => {
    const signed = contract({ status: 'signed' }, { followUpPlan: 'standard' });
    const adopter = contractNextSteps(signed, 'adopter', opts);
    expect(adopter?.title).toContain('Chorizo');
    expect(adopter?.steps.at(-1)?.text).toContain('Mis animales');
    expect(adopter?.steps.at(-1)?.text).toContain('a los 15 días');
    const org = contractNextSteps(signed, 'organization', opts);
    expect(org?.steps.some((s) => s.text.includes('Entregar a Chorizo'))).toBe(true);
  });

  it('cancelado: no hay nada que guiar', () => {
    expect(contractNextSteps(contract({ status: 'cancelled' }), 'adopter', opts)).toBeNull();
  });
});
