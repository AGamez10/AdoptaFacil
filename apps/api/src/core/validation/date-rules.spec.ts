import { scheduleFollowUpSchema } from '../../modules/adoptions/followup.schemas';
import { createClinicalEventSchema } from '../../modules/animals/clinical.schemas';
import { createAnimalSchema } from '../../modules/animals/animals.schemas';
import { createCampaignEvidenceSchema } from '../../modules/campaigns/campaign-evidences.schemas';
import { createCampaignSchema } from '../../modules/campaigns/campaigns.schemas';
import { createPetProfileSchema } from '../../modules/community/community-directory.schemas';
import { uploadDocumentSchema } from '../../modules/org/documents.schemas';

/** Día relativo a hoy, como lo envía el formulario (medianoche UTC). */
const day = (offset: number) =>
  `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`;

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('criterio compartido de fechas en la API (mismo que la web)', () => {
  it('documentos: expedición no futura, vencimiento no pasado y posterior a la expedición', () => {
    const base = { type: 'rut', filename: 'rut.pdf' };
    expect(
      uploadDocumentSchema.safeParse({ ...base, issuedAt: day(-30), expiresAt: day(300) }).success,
    ).toBe(true);
    expect(messages(uploadDocumentSchema.safeParse({ ...base, issuedAt: day(5) }))).toContain(
      'La fecha de expedición no puede ser posterior a hoy.',
    );
    expect(messages(uploadDocumentSchema.safeParse({ ...base, expiresAt: day(-1) }))).toContain(
      'La fecha de vencimiento no puede ser anterior a hoy.',
    );
    expect(
      messages(uploadDocumentSchema.safeParse({ ...base, expiresAt: '2027-02-29' })),
    ).toContain('La fecha de vencimiento no existe en el calendario. Revisa el día y el mes.');
  });

  it('campañas: la fecha límite de una campaña nueva no está en el pasado; un gasto no es futuro', () => {
    const campaign = { title: 'Cirugías', category: 'surgeries', goalAmount: 1_000_000 };
    expect(createCampaignSchema.safeParse({ ...campaign, deadline: day(30) }).success).toBe(true);
    expect(messages(createCampaignSchema.safeParse({ ...campaign, deadline: day(-1) }))).toContain(
      'La fecha límite de la campaña no puede ser anterior a hoy.',
    );
    const evidence = { type: 'invoice', concept: 'Vacunas', filename: 'f.pdf' };
    expect(
      messages(createCampaignEvidenceSchema.safeParse({ ...evidence, spentAt: day(2) })),
    ).toContain('La fecha del gasto no puede ser posterior a hoy.');
  });

  it('clínica: evento no futuro y la próxima fecha no antes del evento', () => {
    expect(
      createClinicalEventSchema.safeParse({
        type: 'vaccine',
        occurredAt: day(-1),
        nextDueDate: day(300),
      }).success,
    ).toBe(true);
    expect(
      messages(createClinicalEventSchema.safeParse({ type: 'vaccine', occurredAt: day(1) })),
    ).toContain('La fecha del evento clínico no puede ser posterior a hoy.');
    expect(
      messages(
        createClinicalEventSchema.safeParse({
          type: 'vaccine',
          occurredAt: day(-1),
          nextDueDate: day(-10),
        }),
      ),
    ).toContain('La próxima fecha no puede ser anterior a la fecha del evento clínico.');
  });

  it('nacimientos (animal y mascota): ni futuros, ni inexistentes, ni formatos ambiguos', () => {
    const animal = { name: 'Luna', species: 'dog', sex: 'female', size: 'small' };
    expect(messages(createAnimalSchema.safeParse({ ...animal, birthDate: day(1) }))).toContain(
      'La fecha de nacimiento no puede ser posterior a hoy.',
    );
    expect(
      createAnimalSchema.safeParse({ ...animal, birthDate: '2025-02-30T00:00:00.000Z' }).success,
    ).toBe(false);
    const pet = { name: 'Toby', species: 'cat' };
    expect(createPetProfileSchema.safeParse({ ...pet, birthDate: '2024-02-29' }).success).toBe(
      true,
    );
    for (const birthDate of ['2023-02-29', '12/03/2024', '2024-3-12', day(-30)]) {
      expect(createPetProfileSchema.safeParse({ ...pet, birthDate }).success).toBe(false);
    }
  });

  it('seguimiento postadopción: el hito no se programa en el pasado', () => {
    const base = { contractId: '11111111-1111-1111-1111-111111111111', title: 'Visita' };
    expect(scheduleFollowUpSchema.safeParse({ ...base, dueAt: day(30) }).success).toBe(true);
    expect(messages(scheduleFollowUpSchema.safeParse({ ...base, dueAt: day(-2) }))).toContain(
      'La fecha del hito no puede ser anterior a hoy.',
    );
  });
});
