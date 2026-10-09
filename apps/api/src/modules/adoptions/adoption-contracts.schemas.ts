import { z } from 'zod';

/** Runtime validation for M04 adoption CONTRACTS (T-028b). `.strict()` rejects
 *  unknown keys so no extra field can be smuggled in. */

const uuid = z.string().uuid();

/** Texto libre sin caracteres de control (salvo salto de línea y tabulador):
 *  todo esto termina en un PDF, en un correo y en pantalla. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !CONTROL_CHARS.test(v), { message: 'Contiene caracteres no permitidos.' });

const signerInputSchema = z
  .object({
    role: z.enum(['adopter', 'witness', 'co_adopter']),
    fullName: text(200),
    email: z.string().trim().toLowerCase().email().max(320),
    // Obligatorio: un firmante sin cuenta nunca podría firmar y el contrato
    // quedaría bloqueado para siempre en `pending_signatures`.
    userId: uuid,
  })
  .strict();

export const generateAdoptionContractSchema = z
  .object({
    requestId: uuid,
    additionalSigners: z.array(signerInputSchema).max(10).optional(),
    terms: text(20000).optional(),
  })
  .strict();

export const transitionAdoptionContractSchema = z
  .object({
    targetStatus: z.enum(['pending_signatures', 'cancelled']),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

/** `signatureBase64` is validated as REQUIRED only for non-representative
 *  signers — the role is only known once the service loads the contract, so
 *  that part of the check lives in `AdoptionContractsService.sign`, not here. */
export const signAdoptionContractSchema = z
  .object({
    signerId: uuid,
    signatureBase64: z.string().trim().min(1).max(2_000_000).optional(),
    signatureContentType: text(100).optional(),
  })
  .strict();

/**
 * `PATCH /adoptions/contracts/:id/data` — cualquier subconjunto de
 * `AdoptionContractData` (requerimiento: diligenciar peso/estado de salud +
 * corregir cualquier campo auto-rellenado). Todos opcionales: el cliente
 * envía solo lo que cambió.
 */
export const updateAdoptionContractDataSchema = z
  .object({
    organizationNit: text(50).optional(),
    organizationAddress: text(300).optional(),
    animalBreed: text(200).optional(),
    animalSex: text(50).optional(),
    animalAgeYears: z.number().min(0).max(100).optional(),
    weightKg: z.number().positive().max(500).optional(),
    healthStatusAtDelivery: text(2000).optional(),
    adopterDocumentNumber: text(50).optional(),
    adopterAddress: text(300).optional(),
    followUpMonths: z.number().int().positive().max(60).optional(),
    signatureCity: text(200).optional(),
    // --- plantilla v2 (aditivos) ---
    organizationName: text(200).optional(),
    adopterDocumentType: z.enum(['CC', 'CE', 'PPT', 'PA']).optional(),
    identityDocumentVerified: z.boolean().optional(),
    minimumSignerAge: z.number().int().min(18).max(30).optional(),
    animalIdentificationType: z.enum(['microchip', 'tag', 'none']).optional(),
    animalIdentificationNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 -]{1,40}$/, 'Solo letras, números, espacios y guiones.')
      .optional(),
    animalSterilized: z.boolean().optional(),
    sterilizationCommitmentMonths: z.number().int().min(1).max(24).optional(),
    trialPeriodDays: z.number().int().min(1).max(30).optional(),
    followUpPlan: z.enum(['light', 'standard']).optional(),
    backupCaregiverName: text(200).optional(),
    backupCaregiverPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/, 'Celular no válido.')
      .optional(),
    backupCaregiverInformed: z.boolean().optional(),
    recoveryFeeCop: z.number().int().min(0).max(5_000_000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });
