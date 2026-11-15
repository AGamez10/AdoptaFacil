import { z } from 'zod';

/** Runtime validation for M04 adoption CONTRACTS (T-028b). `.strict()` rejects
 *  unknown keys so no extra field can be smuggled in. */

const uuid = z.string().guid();

/** Texto libre sin caracteres de control (salvo salto de línea y tabulador):
 *  todo esto termina en un PDF, en un correo y en pantalla. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const text = (max: number) =>
  z
    .string({ error: 'Escribe un texto.' })
    .trim()
    .min(1, 'Este dato no puede quedar vacío.')
    .max(max, `Este texto es muy largo (máximo ${max} caracteres).`)
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
 * envía solo lo que cambió. `null` BORRA el dato (dejar un campo en blanco).
 */
export const updateAdoptionContractDataSchema = z
  .object({
    organizationNit: text(50).nullable().optional(),
    organizationAddress: text(300).nullable().optional(),
    animalBreed: text(200).nullable().optional(),
    animalSex: text(50).nullable().optional(),
    animalAgeYears: z
      .number({ error: 'Escribe la edad en años, solo con números.' })
      .min(0, 'La edad no puede ser negativa.')
      .max(100, 'Revisa la edad: no puede pasar de 100 años.')
      .nullable()
      .optional(),
    weightKg: z
      .number({ error: 'Escribe el peso en kilos, solo con números.' })
      .positive('El peso debe ser mayor que cero.')
      .max(500, 'Revisa el peso: no puede pasar de 500 kg.')
      .nullable()
      .optional(),
    healthStatusAtDelivery: text(2000).nullable().optional(),
    adopterDocumentNumber: text(50).nullable().optional(),
    adopterAddress: text(300).nullable().optional(),
    followUpMonths: z
      .number({ error: 'Escribe los meses de seguimiento, solo con números.' })
      .int('Los meses de seguimiento deben ser un número entero.')
      .positive('El seguimiento debe durar al menos 1 mes.')
      .max(60, 'El seguimiento no puede pasar de 60 meses.')
      .nullable()
      .optional(),
    signatureCity: text(200).nullable().optional(),
    // --- plantilla v2 (aditivos) ---
    organizationName: text(200).nullable().optional(),
    adopterDocumentType: z.enum(['CC', 'CE', 'PPT', 'PA']).nullable().optional(),
    identityDocumentVerified: z.boolean().nullable().optional(),
    minimumSignerAge: z.number().int().min(18).max(30).nullable().optional(),
    animalIdentificationType: z.enum(['microchip', 'tag', 'none']).nullable().optional(),
    animalIdentificationNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 -]{1,40}$/, 'Solo letras, números, espacios y guiones.')
      .nullable()
      .optional(),
    animalSterilized: z.boolean().nullable().optional(),
    sterilizationCommitmentMonths: z
      .number({ error: 'Escribe el plazo para esterilizar en meses.' })
      .int('El plazo para esterilizar debe ser un número entero de meses.')
      .min(1, 'El plazo para esterilizar debe ser de al menos 1 mes.')
      .max(24, 'El plazo para esterilizar no puede pasar de 24 meses.')
      .nullable()
      .optional(),
    trialPeriodDays: z
      .number({ error: 'Escribe los días de prueba, solo con números.' })
      .int('Los días de prueba deben ser un número entero.')
      .min(1, 'La prueba debe durar al menos 1 día.')
      .max(30, 'La prueba no puede pasar de 30 días.')
      .nullable()
      .optional(),
    followUpPlan: z.enum(['light', 'standard']).nullable().optional(),
    backupCaregiverName: text(200).nullable().optional(),
    backupCaregiverPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/, 'Celular no válido.')
      .nullable()
      .optional(),
    backupCaregiverInformed: z.boolean().nullable().optional(),
    recoveryFeeCop: z
      .number({ error: 'Escribe la cuota en pesos, solo con números.' })
      .int('La cuota debe ir en pesos, sin decimales.')
      .min(0, 'La cuota no puede ser negativa.')
      .max(5_000_000, 'La cuota no puede pasar de 5.000.000 de pesos.')
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No hay cambios para guardar.',
  });
