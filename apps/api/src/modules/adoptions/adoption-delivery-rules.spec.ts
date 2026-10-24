import type { AdoptionDeliveryDetails } from '@adoptafacil/contracts';
import {
  buildAnimalRecord,
  buildMilestonePlan,
  computeDeliveryHash,
  deliveryConfirmUrl,
  generateDeliveryCode,
  hashDeliveryCode,
} from './adoption-delivery-rules';

describe('adoption delivery rules', () => {
  it('generates 6-digit codes and binds the hash to the delivery', () => {
    for (let i = 0; i < 50; i++) expect(generateDeliveryCode()).toMatch(/^\d{6}$/);
    expect(hashDeliveryCode('a', '123456')).toBe(hashDeliveryCode('a', '123456'));
    expect(hashDeliveryCode('a', '123456')).not.toBe(hashDeliveryCode('b', '123456'));
    expect(hashDeliveryCode('a', '123456')).not.toContain('123456');
  });

  it('builds the confirm URL without double slashes', () => {
    expect(deliveryConfirmUrl('https://adoptafacil.co/', 'id-1', '000123')).toBe(
      'https://adoptafacil.co/mis-adopciones/entrega/id-1?codigo=000123',
    );
  });

  it('plans 1, 4 and 12 months by default, and adds 15 days for the accompanied plan', () => {
    expect(buildMilestonePlan({ followUpMonths: 12 }).map((m) => m.offset)).toEqual([
      '1 month',
      '4 months',
      '12 months',
    ]);
    expect(
      buildMilestonePlan({ followUpMonths: 12, followUpPlan: 'standard' }).map((m) => m.offset),
    ).toEqual(['15 days', '1 month', '4 months', '12 months']);
  });

  it('drops milestones beyond the agreed follow-up and adds the sterilization deadline', () => {
    const plan = buildMilestonePlan({
      followUpMonths: 6,
      animalSterilized: false,
      sterilizationCommitmentMonths: 3,
    });
    expect(plan.map((m) => m.offset)).toEqual(['1 month', '4 months', '3 months']);
    expect(plan[2]?.title).toBe('Soporte de esterilización');
    expect(
      buildMilestonePlan({ followUpMonths: 12, animalSterilized: true }).map((m) => m.title),
    ).not.toContain('Soporte de esterilización');
  });

  it('keeps only the current version of each clinical event and no team data', () => {
    const record = buildAnimalRecord({
      organizationName: 'Refugio',
      animal: {
        id: 'a1',
        name: 'Luna',
        species: 'dog',
        sex: 'female',
        breed: null,
        birthDate: null,
        approximateAgeMonths: 18,
      },
      contractData: {
        followUpMonths: 12,
        animalIdentificationType: 'microchip',
        animalIdentificationNumber: '985112',
        animalSterilized: false,
        sterilizationCommitmentMonths: 4,
      },
      clinicalEvents: [
        {
          eventId: 'e1',
          version: 1,
          type: 'vaccine',
          occurredAt: new Date('2026-01-01T00:00:00Z'),
          nextDueDate: null,
        },
        {
          eventId: 'e1',
          version: 2,
          type: 'vaccine',
          occurredAt: new Date('2026-01-02T00:00:00Z'),
          nextDueDate: new Date('2027-01-02T00:00:00Z'),
        },
        {
          eventId: 'e2',
          version: 1,
          type: 'allergy',
          occurredAt: new Date('2025-06-01T00:00:00Z'),
          nextDueDate: null,
        },
      ],
      behaviorDisclosures: [
        {
          reactivityNotes: null,
          biteHistory: false,
          biteHistoryDetail: null,
          childrenCompatibility: 'yes',
          medicalConditionsRelevant: null,
          declaredAt: new Date('2026-02-01T00:00:00Z'),
        },
      ],
    });
    expect(record.clinical).toEqual([
      { type: 'allergy', occurredAt: '2025-06-01T00:00:00.000Z' },
      {
        type: 'vaccine',
        occurredAt: '2026-01-02T00:00:00.000Z',
        nextDueDate: '2027-01-02T00:00:00.000Z',
      },
    ]);
    expect(record.identification).toEqual({ type: 'microchip', number: '985112' });
    expect(record.sterilized).toBe(false);
    expect(record.sterilizationCommitmentMonths).toBe(4);
    expect(record.behavior).toEqual({
      biteHistory: false,
      childrenCompatibility: 'yes',
      declaredAt: '2026-02-01T00:00:00.000Z',
    });
    expect(record.animal).not.toHaveProperty('breed');
  });

  it('seals the act with a hash independent of key order', () => {
    const details: AdoptionDeliveryDetails = {
      healthStatus: 'Sano',
      weightKg: 10,
      identityVerified: true,
      identificationChecked: true,
      items: ['food'],
      photoRef: 'private/o/x.png',
    };
    const record = {
      organizationName: 'R',
      animal: { id: 'a', name: 'L', species: 'dog', sex: 'female' },
      clinical: [],
    };
    const a = computeDeliveryHash({ contractId: 'c', details, record, milestonePlan: [] });
    const reordered = computeDeliveryHash({
      milestonePlan: [],
      record,
      details: { ...details, weightKg: 10 },
      contractId: 'c',
    });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered).toBe(a);
    expect(
      computeDeliveryHash({
        contractId: 'c',
        details: { ...details, weightKg: 11 },
        record,
        milestonePlan: [],
      }),
    ).not.toBe(a);
  });
});
