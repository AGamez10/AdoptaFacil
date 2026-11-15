import request from 'supertest';
import { missingAdoptionContractFields } from '@adoptafacil/contracts';

const DEFAULTS: Record<string, unknown> = {
  organizationName: 'Organización de prueba',
  organizationNit: '900000000-1',
  organizationAddress: 'Calle 1 # 2-3, Bogotá',
  animalSex: 'male',
  weightKg: 12,
  healthStatusAtDelivery: 'Sano, vacunado y desparasitado.',
  adopterDocumentNumber: '1000000000',
  adopterAddress: 'Calle 1 # 2-3, Bogotá',
  signatureCity: 'Bogotá',
  animalIdentificationNumber: 'PLACA-001',
};

/**
 * Diligencia SOLO los datos obligatorios que le falten al contrato de adopción
 * (peso y estado de salud nunca se auto-rellenan), para que los flujos de
 * prueba que firman un contrato pasen la validación de "contrato completo".
 */
export async function completeTestContractData(
  server: Parameters<typeof request>[0],
  token: string,
  contractId: string,
): Promise<void> {
  const current = await request(server)
    .get(`/adoptions/contracts/org/${contractId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const patch: Record<string, unknown> = {};
  for (const { field } of missingAdoptionContractFields(current.body.payload.data)) {
    patch[field] = DEFAULTS[field];
  }
  if (Object.keys(patch).length === 0) return;
  await request(server)
    .patch(`/adoptions/contracts/${contractId}/data`)
    .set('Authorization', `Bearer ${token}`)
    .send(patch)
    .expect(200);
}
