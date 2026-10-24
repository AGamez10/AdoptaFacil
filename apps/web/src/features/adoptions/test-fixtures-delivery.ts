import type { AdoptionDelivery } from '@adoptafacil/contracts';

/** Acta de entrega de ejemplo para las pruebas del ajuste 6. */
export const DELIVERY: AdoptionDelivery = {
  id: 'dl-1',
  organizationId: 'org-1',
  contractId: 'c1',
  requestId: 'r1',
  animalId: 'a1',
  animalName: 'Luna',
  status: 'pending_confirmation',
  details: {
    healthStatus: 'Sana y desparasitada',
    weightKg: 12.5,
    identityVerified: true,
    identificationChecked: true,
    items: ['vaccine_card', 'food'],
    photoRef: 'private/org-1/x-foto.png',
  },
  record: {
    organizationName: 'Refugio Huellas',
    animal: { id: 'a1', name: 'Luna', species: 'dog', sex: 'female', breed: 'Criolla' },
    identification: { type: 'microchip', number: '985112' },
    sterilized: false,
    sterilizationCommitmentMonths: 4,
    clinical: [
      {
        type: 'vaccine',
        occurredAt: '2026-09-01T15:00:00.000Z',
        nextDueDate: '2027-09-01T15:00:00.000Z',
      },
    ],
    behavior: {
      biteHistory: false,
      childrenCompatibility: 'yes',
      declaredAt: '2026-09-02T15:00:00.000Z',
    },
  },
  milestonePlan: [{ title: 'Seguimiento del primer mes', offset: '1 month' }],
  contentHash: 'f'.repeat(64),
  codeExpiresAt: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-10-17T15:00:00.000Z',
  confirmedAt: null,
};

export const CONFIRMED: AdoptionDelivery = {
  ...DELIVERY,
  status: 'confirmed',
  codeExpiresAt: null,
  confirmedAt: '2026-10-17T16:00:00.000Z',
};

/** Respuesta JSON con estado, para `fetch` simulado. */
export function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: '',
    headers: { get: () => null },
    json: async () => body,
    blob: async () => new Blob(),
  });
}
